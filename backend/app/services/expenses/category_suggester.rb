# frozen_string_literal: true

module Expenses
  class CategorySuggester
    RULES = {
      'fuel' => /\b(?:diesel|petrol|gasoline|fuel|cng)\b/,
      'food_and_drink' => /\b(?:breakfast|brunch|lunch|dinner|meals?|snacks?|coffee|tea|caf[eé]|
                              restaurants?|dhaba|bakery|alcohol(?:ic)?|liquor|beers?|wines?|cocktails?|
                              whisk(?:y|ey|ies|eys)|vodka|rum|gin|tequila|cider|brandy|bourbon|champagne|prosecco)\b/x,
      'transport' => /\b(?:trains?|flights?|airfare|buses|bus|metro|ferry|taxis?|cabs?|uber|ola|rickshaw|
                         tolls?|parking|car\srental)\b/x,
      'activities' => /\b(?:museums?|aquarium|zoo|theme\spark|sightseeing|safari|trekking|concerts?|kayaking|rafting|
                           tombs?|palaces?|forts?|castles?|monuments?|mausoleums?|ruins|temples?|heritage\ssites?)\b/x,
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
