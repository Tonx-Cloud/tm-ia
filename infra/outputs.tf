output "bucket_name" {
  value = google_storage_bucket.assets.name
}

output "service_account_email" {
  value = google_service_account.backend.email
}
