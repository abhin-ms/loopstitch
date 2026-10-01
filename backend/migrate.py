"""
Idempotent schema migration for Loopstitch.

`Base.metadata.create_all()` creates NEW tables but never alters EXISTING ones.
This script:
  1. Creates any missing tables (settings, offers, ...)
  2. Adds missing columns to existing tables (orders, order_items)
  3. Seeds default store settings on first run

Safe to run multiple times — every step checks before acting.

Run once after each deploy that changes the schema:

    python migrate.py

(or inside Docker:  docker exec -it loopstitch-app-1 python migrate.py)
"""
import sqlalchemy as sa
from app.database import engine, SessionLocal, Base
from app import models


def get_columns(conn: sa.engine.Connection, table: str) -> set:
    insp = sa.inspect(conn)
    if table not in insp.get_table_names():
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def add_column(conn: sa.engine.Connection, table: str, column: sa.Column) -> None:
    col_type = column.type.compile(dialect=engine.dialect)
    default = ""
    if column.server_default is not None and isinstance(column.server_default.arg, str):
        default = f" DEFAULT '{column.server_default.arg}'"
    elif column.nullable is False:
        # backfill existing rows so NOT NULL succeeds
        if str(col_type).startswith("FLOAT"):
            default = " DEFAULT 0"
        else:
            default = " DEFAULT ''"
    conn.execute(sa.text(f"ALTER TABLE {table} ADD COLUMN {column.name} {col_type}{default}"))
    print(f"  + {table}.{column.name} ({col_type})")


def ensure_columns() -> None:
    wanted = {
        "orders": [
            models.Order.discount_amount,
            models.Order.offer_id,
            models.Order.offer_label,
            models.Order.coupon_id,
            models.Order.coupon_code,
            models.Order.coupon_discount,
            models.Order.payment_method,
            models.Order.razorpay_order_id,
            models.Order.razorpay_payment_id,
            models.Order.razorpay_signature,
            models.Order.cod_advance_paid,
            models.Order.cod_advance_percent,
            models.Order.customer_id,
            models.Order.order_type,
            models.Order.custom_total_pieces,
        ],
        "order_items": [
            models.OrderItem.line_discount,
            models.OrderItem.color_id,
            models.OrderItem.color_name,
            models.OrderItem.is_custom,
            models.OrderItem.print_area,
            models.OrderItem.design_notes,
        ],
        "products": [
            models.Product.meta_title,
            models.Product.meta_description,
        ],
        "product_images": [
            models.ProductImage.color_id,
        ],
        "product_sizes": [
            models.ProductSize.color_id,
        ],
    }
    with engine.begin() as conn:
        for table, columns in wanted.items():
            existing = get_columns(conn, table)
            if not existing:
                print(f"  ! table '{table}' does not exist yet — create_all will handle it")
                continue
            for column in columns:
                if column.name not in existing:
                    add_column(conn, table, column)
        if "color_name" in get_columns(conn, "order_items"):
            conn.execute(sa.text("UPDATE order_items SET color_name = '' WHERE color_name IS NULL"))
            print("  + backfilled empty color names on existing order items")


def ensure_product_color_schema() -> None:
    """Create color variants and attach legacy product data to a default color."""
    models.ProductColor.__table__.create(bind=engine, checkfirst=True)
    with engine.begin() as conn:
        insp = sa.inspect(conn)
        if "product_sizes" in insp.get_table_names():
            # Keep the foreign key on product_id indexed after removing the
            # legacy composite index that InnoDB currently uses for it.
            indexes = {index.get("name") for index in insp.get_indexes("product_sizes")}
            if "ix_product_sizes_product_id" not in indexes:
                try:
                    conn.execute(sa.text(
                        "ALTER TABLE product_sizes ADD INDEX "
                        "ix_product_sizes_product_id (product_id)"
                    ))
                    print("  + added product_id foreign-key index")
                except Exception as exc:
                    print(f"  ! could not add product_id index: {exc}")

            # Remove the old product-wide size uniqueness rule. A size can now
            # exist once per color, not once per product.
            for constraint in insp.get_unique_constraints("product_sizes"):
                columns = constraint.get("column_names", [])
                if columns == ["product_id", "size"] or set(columns) == {"product_id", "size"}:
                    name = constraint.get("name")
                    if not name:
                        continue
                    try:
                        conn.execute(sa.text(f"ALTER TABLE product_sizes DROP INDEX `{name}`"))
                        print(f"  + removed legacy product size constraint '{name}'")
                    except Exception as exc:
                        print(f"  ! could not remove legacy constraint '{name}': {exc}")

            new_constraint = "uq_product_size_color"
            existing = {
                c.get("name") for c in insp.get_unique_constraints("product_sizes")
            }
            if new_constraint not in existing:
                try:
                    conn.execute(sa.text(
                        "ALTER TABLE product_sizes ADD UNIQUE INDEX "
                        "uq_product_size_color (product_id, size, color_id)"
                    ))
                    print("  + added color-aware product size constraint")
                except Exception as exc:
                    print(f"  ! could not add color-aware size constraint: {exc}")

    db = SessionLocal()
    try:
        products = db.query(models.Product).all()
        for product in products:
            if product.colors:
                continue
            color = models.ProductColor(
                product_id=product.id,
                name=product.colorway.strip() or "Default",
                hex_code="#000000",
                position=0,
            )
            db.add(color)
            db.flush()
            for image in product.images:
                image.color_id = color.id
            for size in product.sizes:
                size.color_id = color.id
        db.commit()
    finally:
        db.close()


def ensure_customer_tables() -> None:
    """Create customers, addresses, otps tables if they do not exist."""
    with engine.begin() as conn:
        insp = sa.inspect(conn)
        for table_name in ["customers", "addresses", "otps"]:
            if table_name not in insp.get_table_names():
                print(f"  + creating '{table_name}' table")
                table = models.Base.metadata.tables[table_name]
                table.create(bind=conn, checkfirst=True)


def ensure_notifications_table() -> None:
    """Create notifications table if it does not exist."""
    with engine.begin() as conn:
        insp = sa.inspect(conn)
        if "notifications" not in insp.get_table_names():
            print("  + creating 'notifications' table")
            models.Notification.__table__.create(bind=conn, checkfirst=True)


def seed_settings() -> None:
    defaults = {
        "delivery_fee": "45",
        "free_shipping_threshold": "1000",
        "cod_advance_percent": "10",
        "cod_enabled": "false",
        "whatsapp_enabled": "true",
        "launch_mode": "false",
    }
    db = SessionLocal()
    try:
        changed = False
        for key, value in defaults.items():
            row = db.query(models.Setting).filter(models.Setting.key == key).first()
            if not row:
                db.add(models.Setting(key=key, value=value))
                print(f"  + setting '{key}' = {value}")
                changed = True
        if changed:
            db.commit()
    finally:
        db.close()


def ensure_custom_tshirt_tables() -> None:
    """Create custom t-shirt tables and seed default config."""
    with engine.begin() as conn:
        insp = sa.inspect(conn)
        for table_name in ["custom_tshirt_config", "custom_tshirt_colors", "custom_tshirt_qty_discounts", "custom_tshirt_designs"]:
            if table_name not in insp.get_table_names():
                print(f"  + creating '{table_name}' table")
                table = models.Base.metadata.tables[table_name]
                table.create(bind=conn, checkfirst=True)

    db = SessionLocal()
    try:
        config = db.query(models.CustomTshirtConfig).first()
        if not config:
            db.add(models.CustomTshirtConfig(base_price=299, min_order_qty=10, is_active=True))
            db.commit()
            print("  + seeded custom t-shirt config (base_price=299, min_order_qty=10)")
    finally:
        db.close()


def main() -> None:
    print("Loopstitch migration")
    print("1/6 creating missing tables...")
    Base.metadata.create_all(bind=engine)
    print("2/6 ensuring customer tables...")
    ensure_customer_tables()
    print("3/6 ensuring notifications table...")
    ensure_notifications_table()
    print("4/6 adding missing columns...")
    ensure_columns()
    print("5/6 adding color variants...")
    ensure_product_color_schema()
    print("6/6 seeding default settings...")
    seed_settings()
    print("6.5/6 ensuring custom t-shirt tables...")
    ensure_custom_tshirt_tables()
    print("Done.")


if __name__ == "__main__":
    main()
