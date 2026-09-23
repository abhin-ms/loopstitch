"""
Run this once after installing requirements to:
  1. Create the database tables
  2. Create your admin login (username + password you choose)
  3. (Optional) add a couple of sample products so the storefront isn't empty

Usage:
    python seed.py
"""
import sys
import getpass
from app.database import SessionLocal, engine, Base
from app import models
from app.auth import hash_password

Base.metadata.create_all(bind=engine)


def main():
    db = SessionLocal()
    try:
        if db.query(models.Admin).count() == 0:
            print("No admin account found. Let's create one.")
            username = input("Choose an admin username: ").strip() or "admin"
            password = getpass.getpass("Choose an admin password: ").strip() or "loopstitch123"
            admin = models.Admin(username=username, hashed_password=hash_password(password))
            db.add(admin)
            db.commit()
            print(f"✔ Admin account '{username}' created.")
            print("  Log in at: /admin/login")
        else:
            print("Admin account already exists, skipping.")

        if db.query(models.Product).count() == 0:
            add_demo = input("Add 2 demo products so the store isn't empty? (y/n): ").strip().lower()
            if add_demo == "y":
                p1 = models.Product(
                    name="Ronin Wave Tee", slug="ronin-wave-tee",
                    description="Oversized print on premium 250 GSM cotton fabric. Inspired by ukiyo-e wave art with a modern streetwear cut.",
                    price=899, compare_at_price=1199, category="tshirt", colorway="Black",
                    is_active=True, is_featured=True,
                )
                p1.sizes = [
                    models.ProductSize(size="S", stock=8),
                    models.ProductSize(size="M", stock=12),
                    models.ProductSize(size="L", stock=10),
                    models.ProductSize(size="XL", stock=5),
                    models.ProductSize(size="XXL", stock=0),
                ]
                p2 = models.Product(
                    name="Neon District Tee", slug="neon-district-tee",
                    description="Cyberpunk-anime skyline graphic, glow-in-the-dark ink accents. Limited batch of 100.",
                    price=949, compare_at_price=None, category="tshirt", colorway="White",
                    is_active=True, is_featured=True,
                )
                p2.sizes = [
                    models.ProductSize(size="S", stock=6),
                    models.ProductSize(size="M", stock=9),
                    models.ProductSize(size="L", stock=0),
                    models.ProductSize(size="XL", stock=4),
                ]
                db.add_all([p1, p2])
                db.commit()
                print("✔ Demo products added. Upload real images for them from the admin dashboard.")
        print("\nSetup complete. Start the API with:\n    uvicorn app.main:app --reload --port 8000")
    finally:
        db.close()


if __name__ == "__main__":
    main()
