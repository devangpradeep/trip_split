# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_05_06_100000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "pgcrypto"

  create_table "expense_splits", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.decimal "amount"
    t.datetime "created_at", null: false
    t.uuid "expense_id", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["expense_id"], name: "index_expense_splits_on_expense_id"
    t.index ["user_id"], name: "index_expense_splits_on_user_id"
  end

  create_table "expenses", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.decimal "amount"
    t.string "category"
    t.datetime "created_at", null: false
    t.uuid "created_by_id", null: false
    t.string "currency"
    t.date "date"
    t.string "description"
    t.uuid "group_id", null: false
    t.uuid "paid_by_id", null: false
    t.string "split_type"
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_expenses_on_created_by_id"
    t.index ["group_id"], name: "index_expenses_on_group_id"
    t.index ["paid_by_id"], name: "index_expenses_on_paid_by_id"
  end

  create_table "group_invites", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.uuid "created_by_id", null: false
    t.datetime "expires_at"
    t.uuid "group_id", null: false
    t.datetime "revoked_at"
    t.string "token", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_group_invites_on_created_by_id"
    t.index ["group_id"], name: "index_group_invites_on_group_id"
    t.index ["revoked_at"], name: "index_group_invites_on_revoked_at"
    t.index ["token"], name: "index_group_invites_on_token", unique: true
  end

  create_table "group_memberships", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.uuid "group_id", null: false
    t.string "role"
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["group_id", "user_id"], name: "index_group_memberships_on_group_id_and_user_id", unique: true
    t.index ["group_id"], name: "index_group_memberships_on_group_id"
    t.index ["user_id"], name: "index_group_memberships_on_user_id"
  end

  create_table "groups", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.uuid "created_by_id", null: false
    t.string "currency"
    t.text "description"
    t.string "name"
    t.datetime "updated_at", null: false
    t.index ["archived_at"], name: "index_groups_on_archived_at"
    t.index ["created_by_id"], name: "index_groups_on_created_by_id"
  end

  create_table "jwt_denylists", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "exp"
    t.string "jti"
    t.datetime "updated_at", null: false
    t.index ["jti"], name: "index_jwt_denylists_on_jti"
  end

  create_table "settlements", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.decimal "amount"
    t.datetime "created_at", null: false
    t.date "date"
    t.uuid "from_user_id", null: false
    t.uuid "group_id", null: false
    t.text "note"
    t.uuid "to_user_id", null: false
    t.datetime "updated_at", null: false
    t.index ["from_user_id"], name: "index_settlements_on_from_user_id"
    t.index ["group_id"], name: "index_settlements_on_group_id"
    t.index ["to_user_id"], name: "index_settlements_on_to_user_id"
  end

  create_table "users", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "avatar_url"
    t.text "bank_account_holder_name"
    t.text "bank_account_number"
    t.text "bank_ifsc"
    t.text "bank_name"
    t.datetime "created_at", null: false
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "name"
    t.string "phone"
    t.datetime "remember_created_at"
    t.datetime "reset_password_sent_at"
    t.string "reset_password_token"
    t.datetime "updated_at", null: false
    t.text "upi_id"
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
  end

  add_foreign_key "expense_splits", "expenses"
  add_foreign_key "expense_splits", "users"
  add_foreign_key "expenses", "groups"
  add_foreign_key "expenses", "users", column: "created_by_id"
  add_foreign_key "expenses", "users", column: "paid_by_id"
  add_foreign_key "group_invites", "groups"
  add_foreign_key "group_invites", "users", column: "created_by_id"
  add_foreign_key "group_memberships", "groups"
  add_foreign_key "group_memberships", "users"
  add_foreign_key "groups", "users", column: "created_by_id"
  add_foreign_key "settlements", "groups"
  add_foreign_key "settlements", "users", column: "from_user_id"
  add_foreign_key "settlements", "users", column: "to_user_id"
end
