/** Shape-faithful RemoteOK /api sample: legal notice first, then jobs. */
export const REMOTEOK_FIXTURE: unknown[] = [
  {
    "0": "legal notice",
    legal: "API Terms of Service: ...attribution required...",
  },
  {
    id: 1092001,
    slug: "junior-backend-developer-acme",
    position: "Junior Backend Developer",
    company: "Acme Cloud",
    location: "Worldwide",
    tags: ["dev", "backend", "python"],
    date: "2026-07-01T09:00:00+00:00",
    salary_min: 30000,
    salary_max: 50000,
    url: "https://remoteok.com/remote-jobs/1092001",
  },
  {
    id: 1092002,
    position: "Senior Machine Learning Engineer",
    company: "BigCorp",
    location: "Remote",
    tags: ["ml", "python"],
    date: "2026-07-02T09:00:00+00:00",
    salary_min: 150000,
    url: "https://remoteok.com/remote-jobs/1092002",
  },
  {
    id: 1092003,
    position: "Marketing Intern",
    company: "Brandify",
    location: "Remote",
    tags: ["marketing", "social media"],
    date: "2026-07-02T10:00:00+00:00",
    url: "https://remoteok.com/remote-jobs/1092003",
  },
  {
    id: 1092004,
    position: "Software Engineering Intern",
    company: "DataNest",
    location: "",
    tags: ["engineering", "internship"],
    date: "2026-07-03T12:00:00+00:00",
    // no salary fields → is_paid must be false + "not stated" note
    url: "https://remoteok.com/remote-jobs/1092004",
  },
  {
    id: 1092005,
    position: "Graduate Data Engineer",
    company: "Acme Cloud",
    location: "Remote, Europe",
    tags: ["data", "sql"],
    date: "not-a-date", // unparseable posted date → row dropped
    url: "https://remoteok.com/remote-jobs/1092005",
  },
];
