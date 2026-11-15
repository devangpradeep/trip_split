# frozen_string_literal: true

module Expenses
  class CategorySuggester
    RULES = {
      'fuel' => /\b(?:diesel|petrol|gasoline|fuel|cng)\b/,
      'food_and_drink' => /\b(?:breakfast|brunch|lunch|dinner|meals?|snacks?|coffee|caf[eé]|
                              restaurants?|dhaba|bakery)\b/x,
      'transport' => /\b(?:trains?|flights?|airfare|buses|bus|metro|ferry|taxis?|cabs?|uber|ola|rickshaw|
                         tolls?|parking|car\srental)\b/x,
      'activities' => /\b(?:museums?|aquarium|zoo|theme park|sightseeing|safari|trekking|concerts?|kayaking|rafting)\b/,
      'accommodation' => /\b(?:hotels?|motels?|hostels?|resorts?|homestay|airbnb|guest house|lodging)\b/
    }.freeze

    def self.call(description)
      return unless description.is_a?(String)

      words = description.downcase.scan(/[[:alnum:]]+/).join(' ')
      matches = RULES.filter_map { |category, pattern| category if pattern.match?(words) }
      matches.first if matches.one?
    end
  end
end
