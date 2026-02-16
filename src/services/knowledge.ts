/**
 * HERCULES KNOWLEDGE BASE
 * This file acts as the evolving brain of the matcher.
 * Rules, synonyms, and guards are added here based on real-world results.
 */

export const TEAM_SYNONYMS: Record<string, string[]> = {
    // International Club Names
    'manchester city': ['man city', 'mancity', 'citizens', 'sky blues', 'mcfc'],
    'manchester united': ['man utd', 'manutd', 'red devils', 'mufc'],
    'tottenham hotspur': ['spurs', 'tottenham', 'thfc'],
    'liverpool': ['reds', 'lfc'],
    'arsenal': ['gunners', 'afc'],
    'chelsea': ['blues', 'cfc'],
    'newcastle united': ['nufc', 'magpies', 'newcastle'],
    'wolverhampton wanderers': ['wolves', 'wwfc'],
    'nottingham forest': ['forest', 'nffc'],
    'brighton hove albion': ['brighton', 'seagulls'],
    'paris saint germain': ['psg', 'paris', 'paris saint-germain'],
    'real madrid': ['madrid', 'los blancos', 'merengues', 'real'],
    'atletico madrid': ['atleti', 'rojoblancos'],
    'barcelona': ['fcb', 'barca', 'blaugrana'],
    'fc bayern munich': ['bayern', 'munich', 'fcb'],
    'borussia dortmund': ['dortmund', 'bvb'],
    'ac milan': ['milan', 'rossoneri'],
    'inter milan': ['inter', 'nerazzurri', 'internazionale', 'inter milano', 'milano'],
    'juventus': ['juve', 'bianconeri'],
    'lecce': ['us lecce'],
    'roma': ['as roma'],
    'lazio': ['ss lazio'],
    'napoli': ['ssc napoli'],
    'atalanta': ['atalanta bc'],
    'fiorentina': ['acf fiorentina'],
    'bayer leverkusen': ['leverkusen', 'b04'],
    'rb leipzig': ['leipzig', 'rbl'],
    'bayern munich': ['fc bayern', 'munich', 'bayern'],
    'brentford': ['brentford fc'],
    'brighton': ['brighton hove albion'],
    'wolves': ['wolverhampton', 'wolves fc'],

    // NBA
    'los angeles lakers': ['lakers', 'lal'],
    'golden state warriors': ['warriors', 'gsw'],
    'cleveland cavaliers': ['cavs', 'cle'],
    'oklahoma city thunder': ['thunder', 'okc'],
    'philadelphia 76ers': ['76ers', 'sixers', 'phi'],
    'brooklyn nets': ['nets', 'bkn'],
    'atlanta hawks': ['hawks', 'atl'],

    // Cricket (High risk for country-name overlap)
    'sri lanka': ['lanka', 'sl'],
    'zimbabwe': ['zim'],
    'south africa': ['sa', 'proteas'],
    'new zealand': ['nz', 'kiwis'],
    'west indies': ['wi', 'windies'],
};

export const EXCLUDED_KEYWORDS = [
    'cards', 'corners', 'offsides', 'passes', 'yellow card', 'red card',
    'free kick', 'throw in', 'substitution', 'possession', 'tackle', 'foul',
    'touches', 'interceptions', 'blocks', 'save', 'goal kick', 'VAR'
];

export const POLITICS_KEYWORDS = [
    'federal', 'spending', 'elon', 'doge', 'trump', 'biden', 'election',
    'presid', 'minister', 'parliament', 'governance', 'candidate', 'party',
    'vote', 'poll', 'referendum', 'council', 'senate', 'governor', 'white house'
];

export const SPORTS_KEYWORDS = [
    'football', 'soccer', 'nba', 'ucl', 'nfl', 'cricket', 'tennis',
    'match', 'team', 'versus', ' vs ', ' v ', 'against', 'beat',
    'league', 'championship', 'cup', 'premier', 'liga', 'serie', 'bundesliga'
];

export const STOP_WORDS = [
    'to', 'win', 'against', 'will', 'be', 'the', 'at', 'in', 'score',
    'goals', 'more', 'than', 'a', 'an', 'and', 'fc', 'ac', 'rc', 'lfc',
    'sc', 'cf', 'fk', 'sk', 'us', 'as', 'ss', 'real'
];

export const LEAGUE_NORMALIZATIONS: Record<string, string> = {
    'epl': 'premier league',
    'england premier league': 'premier league',
    'laliga': 'la liga',
    'primera division': 'la liga',
    'serie a': 'serie a',
    'bundesliga': 'bundesliga',
    'ucl': 'champions league',
    'uefa champions league': 'champions league'
};
