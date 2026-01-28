variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "bucket_name" {
  type = string
}

variable "service_account_id" {
  type    = string
  default = "tm-ia-backend"
}
