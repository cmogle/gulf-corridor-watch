export type SourceDef = {
  id: string;
  name: string;
  category: "government" | "airline" | "transport";
  url: string;
  parser: "rss" | "html";
  region: string;
};

export const PROJECT_NAME = "Gulf Corridor Watch";

export const OFFICIAL_SOURCES: SourceDef[] = [
  {
    id: "us_state_dept_travel",
    name: "US State Dept Travel Advisories",
    category: "government",
    url: "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.rss.xml",
    parser: "rss",
    region: "Global/US",
  },
  {
    id: "uae_mofa",
    name: "UAE Ministry of Foreign Affairs",
    category: "government",
    url: "https://www.mofa.gov.ae/en/mediahub/news",
    parser: "html",
    region: "UAE",
  },
  {
    id: "visit_dubai_news",
    name: "Dubai Government / Visit Dubai News",
    category: "government",
    url: "https://www.visitdubai.com/en/articles",
    parser: "html",
    region: "Dubai",
  },
  {
    id: "emirates_updates",
    name: "Emirates Travel Updates",
    category: "airline",
    url: "https://www.emirates.com/ae/english/help/travel-updates/",
    parser: "html",
    region: "UAE",
  },
  {
    id: "etihad_advisory",
    name: "Etihad Travel Alerts",
    category: "airline",
    url: "https://www.etihad.com/en/help/travel-updates",
    parser: "html",
    region: "UAE",
  },
  {
    id: "oman_air",
    name: "Oman Air Travel Updates",
    category: "airline",
    url: "https://www.omanair.com/om/en/travel-updates",
    parser: "html",
    region: "Oman",
  },
  {
    id: "rta_dubai",
    name: "RTA Dubai",
    category: "transport",
    url: "https://www.rta.ae/wps/portal/rta/ae/home/news-and-media/all-news",
    parser: "html",
    region: "Dubai",
  },
  {
    id: "india_mea",
    name: "India MEA Advisories",
    category: "government",
    url: "https://www.mea.gov.in/press-releases.htm",
    parser: "html",
    region: "India",
  },
  {
    id: "india_immigration_boi",
    name: "India Bureau of Immigration",
    category: "government",
    url: "https://boi.gov.in/",
    parser: "html",
    region: "India",
  },
];
