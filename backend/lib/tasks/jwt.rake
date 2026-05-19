# frozen_string_literal: true

namespace :jwt do
  desc 'Prune expired JWT denylist entries to keep the table lean. Run daily via cron/scheduler.'
  task prune_denylist: :environment do
    deleted = JwtDenylist.where('exp < ?', Time.current).delete_all
    puts "Pruned #{deleted} expired JWT denylist #{'entry'.pluralize(deleted)}."
  end
end
