from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

from . import models


# ---------- Auth ----------
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- Product Images / Sizes ----------
class ProductImageOut(BaseModel):
    id: int
    url: str
    position: int

    class Config:
        from_attributes = True


class ProductSizeIn(BaseModel):
    size: str
    stock: int = Field(default=0, ge=0)


class ProductSizeOut(ProductSizeIn):
    id: int

    class Config:
        from_attributes = True


class ProductColorIn(BaseModel):
    id: Optional[int] = None
    name: str
    hex_code: str = "#000000"
    position: int = 0
    sizes: List[ProductSizeIn] = Field(default_factory=list)


class ProductColorOut(BaseModel):
    id: int
    name: str
    hex_code: str
    position: int
    images: List[ProductImageOut] = []
    sizes: List[ProductSizeOut] = []

    class Config:
        from_attributes = True


# ---------- Products ----------
class ProductBase(BaseModel):
    name: str
    description: str = ""
    price: float = Field(gt=0)
    compare_at_price: Optional[float] = Field(default=None, gt=0)
    category: str = "tshirt"
    colorway: str = ""
    is_active: bool = True
    is_featured: bool = False
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None


class ProductCreate(ProductBase):
    sizes: List[ProductSizeIn] = Field(default_factory=list)
    colors: List[ProductColorIn] = Field(default_factory=list)


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = Field(default=None, gt=0)
    compare_at_price: Optional[float] = Field(default=None, gt=0)
    category: Optional[str] = None
    colorway: Optional[str] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    sizes: Optional[List[ProductSizeIn]] = None
    colors: Optional[List[ProductColorIn]] = None


class ProductOut(ProductBase):
    id: int
    slug: str
    created_at: datetime
    images: List[ProductImageOut] = []
    sizes: List[ProductSizeOut] = []
    colors: List[ProductColorOut] = []
    total_stock: int

    class Config:
        from_attributes = True


# ---------- Orders ----------
class OrderItemIn(BaseModel):
    product_id: int
    size: str
    color_id: Optional[int] = None
    quantity: int = Field(gt=0)


class OrderCreate(BaseModel):
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    shipping_address: str
    city: str = ""
    state: str = ""
    pincode: str = ""
    payment_method: str = "cod"
    coupon_code: Optional[str] = None
    items: List[OrderItemIn]


class OrderItemOut(BaseModel):
    id: int
    product_name: str
    color_id: Optional[int] = None
    color_name: Optional[str] = ""
    size: str
    quantity: int
    unit_price: float
    line_discount: float = 0
    is_custom: bool = False
    print_area: Optional[str] = None
    design_notes: Optional[str] = None

    class Config:
        from_attributes = True


class OrderOut(BaseModel):
    id: int
    order_number: str
    customer_name: str
    customer_email: str
    customer_phone: str
    shipping_address: str
    city: str
    state: str
    pincode: str
    status: str
    subtotal: float
    discount_amount: float = 0
    offer_label: str = ""
    coupon_code: str = ""
    coupon_discount: float = 0
    shipping_fee: float
    total: float
    payment_method: str = "cod"
    razorpay_order_id: Optional[str] = ""
    cod_advance_paid: Optional[float] = 0.0
    cod_advance_percent: Optional[float] = 0.0
    order_type: str = "standard"
    custom_total_pieces: Optional[int] = None
    created_at: datetime
    items: List[OrderItemOut] = []

    class Config:
        from_attributes = True


class OrderStatusUpdate(BaseModel):
    status: models.OrderStatus


# ---------- Razorpay ----------
class RazorpayOrderRequest(BaseModel):
    amount: float = Field(gt=0, description="Amount in INR (e.g. 199.00)")
    currency: str = "INR"
    receipt: str = ""


class RazorpayOrderResponse(BaseModel):
    order_id: str
    amount: int          # amount in paise
    currency: str
    key_id: str          # public key for frontend


class RazorpayVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    order_number: str


# ---------- Coupons ----------
class CouponBase(BaseModel):
    code: str
    discount_percent: float = Field(ge=1, le=100)
    max_uses: int = Field(default=0, ge=0)
    min_order: float = Field(default=0.0, ge=0)
    is_active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class CouponCreate(CouponBase):
    pass


class CouponUpdate(BaseModel):
    code: Optional[str] = None
    discount_percent: Optional[float] = Field(default=None, ge=1, le=100)
    max_uses: Optional[int] = Field(default=None, ge=0)
    min_order: Optional[float] = Field(default=None, ge=0)
    is_active: Optional[bool] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class CouponOut(CouponBase):
    id: int
    times_used: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class CouponValidateRequest(BaseModel):
    code: str
    subtotal: float = 0


class CouponValidateResponse(BaseModel):
    valid: bool
    code: str = ""
    discount_percent: float = 0
    discount_amount: float = 0
    message: str = ""


# ---------- Offers (Buy X Get Y) ----------
class OfferBase(BaseModel):
    name: str
    buy_quantity: int = Field(ge=1)
    get_quantity: int = Field(ge=1)
    scope: models.OfferScope = models.OfferScope.all
    category: Optional[str] = None
    product_ids: List[int] = Field(default_factory=list)
    is_active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class OfferCreate(OfferBase):
    pass


class OfferUpdate(BaseModel):
    name: Optional[str] = None
    buy_quantity: Optional[int] = Field(default=None, ge=1)
    get_quantity: Optional[int] = Field(default=None, ge=1)
    scope: Optional[models.OfferScope] = None
    category: Optional[str] = None
    product_ids: Optional[List[int]] = None
    is_active: Optional[bool] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class OfferOut(OfferBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Cart quote (live totals preview) ----------
class QuoteRequest(BaseModel):
    items: List[OrderItemIn]
    coupon_code: Optional[str] = None


class QuoteOut(BaseModel):
    subtotal: float
    discount: float = 0
    offer_label: str = ""
    coupon_code: str = ""
    coupon_discount: float = 0
    shipping_fee: float
    total: float


# ---------- Store settings (admin-editable) ----------
class SettingsOut(BaseModel):
    delivery_fee: float
    free_shipping_threshold: float
    cod_advance_percent: float = 10.0
    cod_enabled: bool = False


class SettingsUpdate(BaseModel):
    delivery_fee: Optional[float] = Field(default=None, ge=0)
    free_shipping_threshold: Optional[float] = Field(default=None, ge=0)
    cod_advance_percent: Optional[float] = Field(default=None, ge=0, le=100)
    cod_enabled: Optional[bool] = None


class PublicShippingSettings(BaseModel):
    delivery_fee: float
    free_shipping_threshold: float


class PublicCheckoutSettings(BaseModel):
    cod_enabled: bool
    cod_advance_percent: float = 10.0
    razorpay_key_id: str = ""


# ---------- Notifications (WhatsApp) ----------
class NotificationOut(BaseModel):
    id: int
    order_id: int
    order_number: str
    customer_name: str
    customer_phone: str
    status: str
    message_type: str = "order_confirm"
    whatsapp_message_id: str = ""
    error_message: str = ""
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    items: List[NotificationOut]
    total: int


# ---------- Customer Auth (OTP login) ----------
class SendOTPRequest(BaseModel):
    phone: str


class SendOTPResponse(BaseModel):
    message: str = "OTP sent successfully"
    expires_in: int = 300  # seconds


class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str


class CustomerTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    customer: "CustomerOut"


class CustomerOut(BaseModel):
    id: int
    name: str
    phone: str
    email: str = ""
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


# ---------- Addresses ----------
class AddressCreate(BaseModel):
    full_address: str
    city: str = ""
    state: str = ""
    pincode: str = ""
    is_default: bool = False


class AddressOut(BaseModel):
    id: int
    full_address: str
    city: str
    state: str
    pincode: str
    is_default: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Order History ----------
class OrderHistoryOut(BaseModel):
    id: int
    order_number: str
    status: str
    subtotal: float
    discount_amount: float = 0
    offer_label: str = ""
    coupon_code: str = ""
    coupon_discount: float = 0
    shipping_fee: float = 0
    total: float
    payment_method: str = "cod"
    cod_advance_paid: float = 0.0
    cod_advance_percent: float = 0.0
    created_at: datetime
    items: List[OrderItemOut] = []

    class Config:
        from_attributes = True


# Rebuild forward refs for CustomerTokenResponse
CustomerTokenResponse.model_rebuild()


# ---------- Custom T-Shirt ----------
class CustomConfigOut(BaseModel):
    base_price: float
    min_order_qty: int
    is_active: bool

    class Config:
        from_attributes = True


class CustomConfigUpdate(BaseModel):
    base_price: Optional[float] = Field(default=None, gt=0)
    min_order_qty: Optional[int] = Field(default=None, ge=1)
    is_active: Optional[bool] = None


class CustomColorIn(BaseModel):
    name: str
    hex_code: str = "#000000"
    is_active: bool = True
    position: int = 0


class CustomColorUpdate(BaseModel):
    name: Optional[str] = None
    hex_code: Optional[str] = None
    is_active: Optional[bool] = None
    position: Optional[int] = None


class CustomColorOut(BaseModel):
    id: int
    name: str
    hex_code: str
    is_active: bool
    position: int

    class Config:
        from_attributes = True


class CustomQtyDiscountIn(BaseModel):
    min_qty: int = Field(ge=1)
    max_qty: Optional[int] = Field(default=None, ge=1)
    discount_percent: float = Field(ge=0, le=100)
    position: int = 0


class CustomQtyDiscountUpdate(BaseModel):
    min_qty: Optional[int] = Field(default=None, ge=1)
    max_qty: Optional[int] = Field(default=None, ge=1)
    discount_percent: Optional[float] = Field(default=None, ge=0, le=100)
    position: Optional[int] = None


class CustomQtyDiscountOut(BaseModel):
    id: int
    min_qty: int
    max_qty: Optional[int]
    discount_percent: float
    position: int

    class Config:
        from_attributes = True


class CustomDesignOut(BaseModel):
    id: int
    file_url: str
    file_name: str
    file_type: str
    print_area: str
    notes: str
    created_at: datetime

    class Config:
        from_attributes = True


class CustomColorSelection(BaseModel):
    color_id: int
    sizes: List[dict]  # [{"size": "M", "quantity": 5}, ...]


class CustomDesignInput(BaseModel):
    file_url: str
    file_name: str
    file_type: str  # "image" or "pdf"
    print_area: str  # "front", "back", "side"
    notes: str = ""


class CustomOrderCreate(BaseModel):
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    shipping_address: str
    city: str = ""
    state: str = ""
    pincode: str = ""
    payment_method: str = "cod"
    colors: List[CustomColorSelection]
    designs: List[CustomDesignInput] = []


class CustomQuoteRequest(BaseModel):
    colors: List[CustomColorSelection]


class CustomQuoteOut(BaseModel):
    total_pieces: int
    base_price: float
    subtotal: float
    discount_percent: float = 0
    discount_amount: float = 0
    shipping_fee: float
    total: float


# ---------- Subscribers & Reviews ----------
class SubscribeIn(BaseModel):
    contact: str = Field(min_length=5, max_length=150)
    source: str = Field(default="home", max_length=50)


class ReviewIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    rating: int = Field(ge=1, le=5)
    title: str = Field(default="", max_length=150)
    body: str = Field(default="", max_length=2000)


class ReviewOut(BaseModel):
    id: int
    product_id: int
    name: str
    rating: int
    title: str
    body: str
    is_approved: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewSummary(BaseModel):
    average: float
    count: int
    reviews: List[ReviewOut]


# ---------- Announcements ----------
class AnnouncementIn(BaseModel):
    message: str = Field(min_length=1, max_length=200)
    detail: str = Field(default="", max_length=300)
    coupon_code: str = Field(default="", max_length=50)
    link_url: str = Field(default="", max_length=300)
    link_label: str = Field(default="", max_length=50)
    style: str = Field(default="acid", pattern="^(acid|riot|ink)$")
    placement: str = Field(default="bar", pattern="^(bar|banner|both)$")
    is_active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class AnnouncementOut(BaseModel):
    id: int
    message: str
    detail: str
    coupon_code: str
    link_url: str
    link_label: str
    style: str
    placement: str
    is_active: bool
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ---------- Instagram posts ----------
class InstagramPostIn(BaseModel):
    url: str = Field(min_length=10, max_length=300)


class InstagramPostOut(BaseModel):
    id: int
    kind: str
    shortcode: str
    is_active: bool

    class Config:
        from_attributes = True


class InstagramVideoOut(BaseModel):
    id: int
    video_url: str
    link_url: str
    is_active: bool

    class Config:
        from_attributes = True


# ---------- Blog ----------
class BlogPostIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    slug: str = Field(default="", max_length=220)
    excerpt: str = Field(default="", max_length=300)
    body: str = Field(default="", max_length=50000)
    cover_url: str = Field(default="", max_length=500)
    is_published: bool = False


class BlogPostOut(BaseModel):
    id: int
    title: str
    slug: str
    excerpt: str
    body: str
    cover_url: str
    is_published: bool
    published_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
