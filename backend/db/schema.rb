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

ActiveRecord::Schema[7.0].define(version: 2026_03_23_092225) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pgcrypto"
  enable_extension "plpgsql"

  create_table "expense_splits", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "expense_id", null: false
    t.uuid "user_id", null: false
    t.decimal "amount"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["expense_id"], name: "index_expense_splits_on_expense_id"
    t.index ["user_id"], name: "index_expense_splits_on_user_id"
  end

  create_table "expenses", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "group_id", null: false
    t.uuid "paid_by_id", null: false
    t.string "description"
    t.decimal "amount"
    t.string "currency"
    t.string "split_type"
    t.date "date"
    t.string "category"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["group_id"], name: "index_expenses_on_group_id"
    t.index ["paid_by_id"], name: "index_expenses_on_paid_by_id"
  end

  create_table "group_memberships", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "user_id", null: false
    t.uuid "group_id", null: false
    t.string "role"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["group_id"], name: "index_group_memberships_on_group_id"
    t.index ["user_id"], name: "index_group_memberships_on_user_id"
  end

  create_table "groups", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "name"
    t.text "description"
    t.string "currency"
    t.uuid "created_by_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_groups_on_created_by_id"
  end

  create_table "jwt_denylists", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "jti"
    t.datetime "exp"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["jti"], name: "index_jwt_denylists_on_jti"
  end

  create_table "settlements", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "group_id", null: false
    t.uuid "from_user_id", null: false
    t.uuid "to_user_id", null: false
    t.decimal "amount"
    t.date "date"
    t.text "note"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["from_user_id"], name: "index_settlements_on_from_user_id"
    t.index ["group_id"], name: "index_settlements_on_group_id"
    t.index ["to_user_id"], name: "index_settlements_on_to_user_id"
  end

  create_table "users", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.string "name"
    t.string "phone"
    t.string "avatar_url"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
  end

  add_foreign_key "expense_splits", "expenses"
  add_foreign_key "expense_splits", "users"
  add_foreign_key "expenses", "groups"
  add_foreign_key "expenses", "users", column: "paid_by_id"
  add_foreign_key "group_memberships", "groups"
  add_foreign_key "group_memberships", "users"
  add_foreign_key "groups", "users", column: "created_by_id"
  add_foreign_key "settlements", "groups"
  add_foreign_key "settlements", "users", column: "from_user_id"
  add_foreign_key "settlements", "users", column: "to_user_id"
end
