# frozen_string_literal: true

namespace :expenses do
  desc 'Preview or apply category suggestions to existing uncategorized expenses'
  task :backfill_categories, [:mode] => :environment do |_task, args|
    mode = args[:mode] || 'preview'
    abort 'Mode must be preview or apply.' unless %w[preview apply].include?(mode)

    cutoff = Time.current
    candidates = Expense.where("category IS NULL OR category = ''").where(updated_at: ...cutoff)
    counts = Hash.new(0)

    candidates.select(:id, :description, :updated_at).find_each do |expense|
      category = Expenses::CategorySuggester.call(expense.description)

      if mode == 'apply' && category
        # Check that the expense still matches the snapshot before writing only the category.
        unchanged = candidates.where(id: expense.id, description: expense.description, updated_at: expense.updated_at)
        next if unchanged.update_all(category: category).zero?
      end

      counts[category] += 1
    end

    unmatched = counts.delete(nil) || 0
    action = mode == 'apply' ? 'Assigned' : 'Would assign'
    puts "#{action} categories for #{counts.values.sum} expenses last updated before #{cutoff.iso8601}."
    counts.sort.each { |category, count| puts "  #{category}: #{count}" }
    puts "Left uncategorized: #{unmatched}"
  end
end
