/** Shape-faithful Arbeitnow job-board-api sample (created_at = unix SECONDS). */
export const ARBEITNOW_FIXTURE = {
  data: [
    {
      slug: "junior-frontend-developer-berlin-11111",
      company_name: "Berlin Webworks",
      title: "Junior Frontend Developer (React)",
      description: "<p>...</p>",
      remote: true,
      url: "https://www.arbeitnow.com/jobs/companies/berlin-webworks/junior-frontend-developer-11111",
      tags: ["Software Development"],
      job_types: ["full time"],
      location: "Berlin",
      created_at: 1751500800, // 2025-07-03T00:00:00Z
    },
    {
      slug: "working-student-data-engineering-22222",
      company_name: "Datenhaus GmbH",
      title: "Working Student — Data Engineering",
      remote: false,
      url: "https://www.arbeitnow.com/jobs/companies/datenhaus/working-student-22222",
      tags: [],
      job_types: ["working student"],
      location: "Munich",
      created_at: 1751587200,
    },
    {
      slug: "head-of-engineering-33333",
      company_name: "ScaleUp",
      title: "Head of Engineering",
      remote: true,
      url: "https://www.arbeitnow.com/jobs/companies/scaleup/head-33333",
      tags: ["Engineering"],
      job_types: ["full time"],
      location: "Hamburg",
      created_at: 1751587200,
    },
    {
      slug: "junior-recruiter-44444",
      company_name: "PeopleFirst",
      title: "Junior Recruiter", // intern-family but NOT tech → dropped
      remote: false,
      url: "https://www.arbeitnow.com/jobs/companies/peoplefirst/junior-recruiter-44444",
      tags: ["HR"],
      job_types: ["full time"],
      location: "Frankfurt",
      created_at: 1751587200,
    },
  ],
  links: { first: "...", next: "..." },
  meta: { current_page: 1 },
};
