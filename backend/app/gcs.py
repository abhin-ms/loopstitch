import os
import base64
import json
import logging

from google.cloud import storage

logger = logging.getLogger(__name__)

_client = None
_bucket_name = None


def get_gcs_client():
    global _client, _bucket_name
    if _client is None:
        b64 = os.getenv("GCS_SERVICE_ACCOUNT_B64")
        _bucket_name = os.getenv("GCS_BUCKET_NAME")
        if not b64 or not _bucket_name:
            raise RuntimeError("GCS_BUCKET_NAME and GCS_SERVICE_ACCOUNT_B64 must be set")
        info = json.loads(base64.b64decode(b64))
        _client = storage.Client.from_service_account_info(info)
    return _client


def upload_to_gcs(file_bytes: bytes, filename: str, content_type: str = "application/octet-stream") -> str:
    bucket = get_gcs_client().bucket(_bucket_name)
    blob = bucket.blob(filename)
    blob.upload_from_string(file_bytes, content_type=content_type)
    # Buckets with uniform bucket-level access reject per-object ACL calls like
    # blob.make_public(); public read must instead be granted once at the bucket
    # level (IAM: allUsers -> Storage Object Viewer), which this bucket has.
    return blob.public_url


def delete_from_gcs(filename: str):
    try:
        bucket = get_gcs_client().bucket(_bucket_name)
        bucket.blob(filename).delete()
    except Exception as exc:
        logger.warning("GCS delete failed for %s: %s", filename, exc)


def get_filename_from_url(url: str) -> str:
    return url.rsplit("/", 1)[-1]
