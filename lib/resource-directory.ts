export type OfficialDirectoryEntry = {
  name: string;
  type: "airline" | "government" | "transport" | "wellbeing";
  region: string;
  contactPage: string;
  phone?: string;
  whatsapp?: string;
  socials?: { label: string; url: string }[];
  note?: string;
};

export const INDIA_TRANSIT_VISA_LINKS = [
  {
    label: "India Bureau of Immigration",
    url: "https://boi.gov.in/",
    note: "Entry/exit and immigration rules",
  },
  {
    label: "India Ministry of External Affairs",
    url: "https://www.mea.gov.in/press-releases.htm",
    note: "Official advisories and notices",
  },
  {
    label: "UAE ICP (Visa/Residency)",
    url: "https://icp.gov.ae/en/",
    note: "UAE entry/visa/residency official portal",
  },
  {
    label: "Emirates visa & passport info",
    url: "https://www.emirates.com/ae/english/before-you-fly/visa-passport-information/",
    note: "Airline guidance for documentation",
  },
  {
    label: "Etihad travel docs",
    url: "https://www.etihad.com/en/help/travel-documents",
    note: "Travel document guidance",
  },
];

export const OFFICIAL_DIRECTORY: OfficialDirectoryEntry[] = [
  {
    name: "Emirates",
    type: "airline",
    region: "UAE",
    contactPage: "https://www.emirates.com/english/help/offices/dxb/dubai/",
    socials: [
      { label: "X", url: "https://x.com/emirates" },
      { label: "Instagram", url: "https://www.instagram.com/emirates/" },
    ],
  },
  {
    name: "Etihad Airways",
    type: "airline",
    region: "UAE",
    contactPage: "https://www.etihad.com/en/help",
    socials: [
      { label: "X", url: "https://x.com/etihad" },
      { label: "Instagram", url: "https://www.instagram.com/etihad/" },
    ],
  },
  {
    name: "flydubai",
    type: "airline",
    region: "UAE",
    contactPage: "https://www.flydubai.com/en/contact",
    socials: [{ label: "X", url: "https://x.com/flydubai" }],
  },
  {
    name: "Air Arabia",
    type: "airline",
    region: "UAE",
    contactPage: "https://www.airarabia.com/en/contact-us",
    socials: [{ label: "X", url: "https://x.com/AirArabiaGroup" }],
  },
  {
    name: "Qatar Airways",
    type: "airline",
    region: "Qatar (Doha transit)",
    contactPage: "https://www.qatarairways.com/en/help.html",
    socials: [{ label: "X", url: "https://x.com/qaboratirways" }],
  },
  {
    name: "Oman Air",
    type: "airline",
    region: "Oman",
    contactPage: "https://www.omanair.com/om/en/contact-us",
    socials: [{ label: "X", url: "https://x.com/abormanair" }],
  },
  {
    name: "RTA Dubai",
    type: "transport",
    region: "Dubai",
    contactPage: "https://www.rta.ae/wps/portal/rta/ae/home/about-rta/contractors-suppliers/contact-information",
    phone: "800 9090",
    socials: [
      { label: "X", url: "https://x.com/rta_dubai" },
      { label: "Instagram", url: "https://www.instagram.com/rta_dubai/" },
    ],
  },
  {
    name: "UAE Ministry of Foreign Affairs",
    type: "government",
    region: "UAE",
    contactPage: "https://www.mofa.gov.ae/en/contact-us",
    socials: [{ label: "X", url: "https://x.com/mofauae" }],
  },
  {
    name: "GDRFA Dubai",
    type: "government",
    region: "Dubai",
    contactPage: "https://www.gdrfad.gov.ae/en/contact-us",
    socials: [{ label: "X", url: "https://x.com/gdrfadubai" }],
  },
  {
    name: "UAE General Civil Aviation Authority (GCAA)",
    type: "government",
    region: "UAE",
    contactPage: "https://www.gcaa.gov.ae/en/pages/contact.aspx",
  },
  {
    name: "UK FCDO — UAE Travel Advice",
    type: "government",
    region: "UK / UAE",
    contactPage: "https://www.gov.uk/foreign-travel-advice/united-arab-emirates",
  },
  {
    name: "Australian DFAT — UAE SmartTraveller",
    type: "government",
    region: "Australia / UAE",
    contactPage: "https://www.smartraveller.gov.au/destinations/middle-east/united-arab-emirates",
  },
  {
    name: "Mental Support Line (UAE) - 800 HOPE",
    type: "wellbeing",
    region: "UAE",
    contactPage: "https://hope.hw.gov.ae/",
    phone: "800 HOPE",
    note: "National mental support initiative page (verify operating hours in page updates)",
  },
  {
    name: "UAE Official Mental Health Guidance",
    type: "wellbeing",
    region: "UAE",
    contactPage: "https://u.ae/en/information-and-services/health-and-fitness/handling-the-covid-19-outbreak/maintaining-mental-health-in-times-of-covid19",
    note: "Official UAE information portal resource",
  },
];
