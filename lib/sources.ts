export type SourceDef = {
  id: string;
  name: string;
  category: "government" | "airline" | "transport";
  url: string;
  parser: "rss" | "html";
  connector: "rss" | "direct_html" | "api";
  fallback_connector?: "chrome_relay";
  extractor_id:
    | "rss_default"
    | "html_title_text"
    | "emirates_updates"
    | "etihad_updates"
    | "omanair_updates"
    | "rta_news"
    | "mofa_news"
    | "visit_dubai_articles"
    | "india_mea_press"
    | "india_boi_home";
  priority: number;
  freshness_target_minutes: number;
  x_handles?: string[];
  region: string;
};

export const PROJECT_NAME = "Gulf Corridor Watch";

export const OFFICIAL_SOURCES: SourceDef[] = [
  {
    id: "us_state_dept_travel",
    name: "US State Dept Travel Advisories",
    category: "government",
    url: "https://travel.state.gov/_res/rss/TAsTWs.xml",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 80,
    freshness_target_minutes: 15,
    region: "Global/US",
  },
  {
    id: "white_house_statements",
    name: "White House Statements & Releases",
    category: "government",
    url: "https://www.whitehouse.gov/briefing-room/statements-releases/feed/",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 92,
    freshness_target_minutes: 10,
    x_handles: ["POTUS", "WhiteHouse"],
    region: "US / Middle East posture",
  },
  {
    id: "us_dod_releases",
    name: "US Department of Defense Releases",
    category: "government",
    url: "https://www.defense.gov/News/Releases/RSS/",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 91,
    freshness_target_minutes: 10,
    x_handles: ["DeptofDefense"],
    region: "US / Regional security",
  },
  {
    id: "us_centcom_news",
    name: "US CENTCOM News",
    category: "government",
    url: "https://www.centcom.mil/MEDIA/NEWS-ARTICLES/News-Article-View/RSS/",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 93,
    freshness_target_minutes: 10,
    x_handles: ["CENTCOM"],
    region: "Middle East security",
  },
  {
    id: "uae_mofa",
    name: "UAE Ministry of Foreign Affairs",
    category: "government",
    url: "https://www.mofa.gov.ae/en/mediahub/news",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "mofa_news",
    priority: 88,
    freshness_target_minutes: 10,
    x_handles: ["mofauae"],
    region: "UAE",
  },
  {
    id: "visit_dubai_news",
    name: "Dubai Government / Visit Dubai News",
    category: "government",
    url: "https://www.mediaoffice.ae/en/news",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "visit_dubai_articles",
    priority: 55,
    freshness_target_minutes: 15,
    region: "Dubai",
  },
  {
    id: "emirates_updates",
    name: "Emirates Travel Updates",
    category: "airline",
    url: "https://www.emirates.com/ae/english/help/travel-updates/",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "emirates_updates",
    priority: 100,
    freshness_target_minutes: 5,
    x_handles: ["emirates"],
    region: "UAE",
  },
  {
    id: "etihad_advisory",
    name: "Etihad Travel Alerts",
    category: "airline",
    url: "https://www.etihad.com/en/help/travel-updates",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "etihad_updates",
    priority: 98,
    freshness_target_minutes: 5,
    x_handles: ["etihad"],
    region: "UAE",
  },
  {
    id: "oman_air",
    name: "Oman Air Travel Updates",
    category: "airline",
    url: "https://www.omanair.com/om/en/travel-updates",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "omanair_updates",
    priority: 70,
    freshness_target_minutes: 10,
    region: "Oman",
  },
  {
    id: "rta_dubai",
    name: "Dubai Transport & Road News (The National)",
    category: "transport",
    url: "https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml",
    parser: "rss",
    connector: "rss",
    extractor_id: "rss_default",
    priority: 90,
    freshness_target_minutes: 5,
    x_handles: ["rta_dubai"],
    region: "Dubai",
  },
  {
    id: "india_mea",
    name: "India MEA Advisories",
    category: "government",
    url: "https://mea.gov.in/press-releases.htm?51/Press_Releases=",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "india_mea_press",
    priority: 65,
    freshness_target_minutes: 15,
    region: "India",
  },
  {
    id: "india_immigration_boi",
    name: "India Bureau of Immigration",
    category: "government",
    url: "https://boi.gov.in/boi",
    parser: "html",
    connector: "direct_html",
    fallback_connector: "chrome_relay",
    extractor_id: "india_boi_home",
    priority: 72,
    freshness_target_minutes: 15,
    region: "India",
  },
];
