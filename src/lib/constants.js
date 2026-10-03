export const DYCI_ACADEMIC_PROGRAMS = {
  "College of Accountancy": [
    "Bachelor of Science in Accountancy",
    "Bachelor of Science in Accounting Information System"
  ],
  "College of Art and Sciences": [
    "Bachelor of Arts in Political Science"
  ],
  "College of Business Administration": [
    "Bachelor of Science in Business Administration",
    "Bachelor of Science in Business Administration Major in Human Resource Development Management",
    "Bachelor of Science in Business Administration Major in Financial Management",
    "Bachelor of Science in Business Administration Major in Operations Management",
    "Bachelor of Science in Business Administration Major in Marketing Management"
  ],
  "College of Computer Studies": [
    "Bachelor of Science in Computer Science",
    "Bachelor of Science in Computer Engineering",
    "Bachelor of Science in Information Technology",
    "Associate in Computer Technology"
  ],
  "College of Education": [
    "Bachelor of Elementary Education",
    "Bachelor of Secondary Education Major in Mathematics",
    "Bachelor of Secondary Education Major in Filipino",
    "Bachelor of Secondary Education Major in English",
    "Bachelor of Secondary Education Major in Sciences",
    "Continuing Professional Teacher Education"
  ],
  "College of Health Sciences": [
    "Bachelor of Science in Nursing",
    "Bachelor of Science in Midwifery"
  ],
  "College of Hospitality Management and Tourism": [
    "Bachelor of Science in Hospitality Management",
    "Bachelor of Science in Tourism Management"
  ],
  "College of Maritime Education": [
    "Bachelor of Science in Marine Transportation",
    "Bachelor of Science in Marine Engineering"
  ],
  "School of Mechanical Engineering": [
    "Bachelor of Science in Mechanical Engineering"
  ],
  "School of Psychology": [
    "Bachelor of Arts in Psychology"
  ]
};

// Institutional Academic & Analytics Cutoffs
export const PASSING_GRADE = 75; // 3.00 on DYCI transmutation scale
export const HIGH_CUTOFF   = 85; // "Performed Well" benchmark threshold
export const SAME_MARGIN   = 2;  // +/- 2 pts margin of difference for term comparisons

export const PROGRAM_ABBREVIATIONS = {
  "Bachelor of Science in Accountancy": "BSA",
  "Bachelor of Science in Accounting Information System": "BSAIS",
  "Bachelor of Arts in Political Science": "BAPS",
  "Bachelor of Science in Business Administration": "BSBA",
  "Bachelor of Science in Business Administration Major in Human Resource Development Management": "BSBA-HRDM",
  "Bachelor of Science in Business Administration Major in Financial Management": "BSBA-FM",
  "Bachelor of Science in Business Administration Major in Operations Management": "BSBA-OM",
  "Bachelor of Science in Business Administration Major in Marketing Management": "BSBA-MM",
  "Bachelor of Science in Computer Science": "BSCS",
  "Bachelor of Science in Computer Engineering": "BSCpE",
  "Bachelor of Science in Information Technology": "BSIT",
  "Associate in Computer Technology": "ACT",
  "Bachelor of Elementary Education": "BEEd",
  "Bachelor of Secondary Education Major in Mathematics": "BSEd-Math",
  "Bachelor of Secondary Education Major in Filipino": "BSEd-Fil",
  "Bachelor of Secondary Education Major in English": "BSEd-Eng",
  "Bachelor of Secondary Education Major in Sciences": "BSEd-Sci",
  "Continuing Professional Teacher Education": "CPTE",
  "Bachelor of Science in Nursing": "BSN",
  "Bachelor of Science in Midwifery": "BSM",
  "Bachelor of Science in Hospitality Management": "BSHM",
  "Bachelor of Science in Tourism Management": "BSTM",
  "Bachelor of Science in Marine Transportation": "BSMT",
  "Bachelor of Science in Marine Engineering": "BSMarE",
  "Bachelor of Science in Mechanical Engineering": "BSME",
  "Bachelor of Arts in Psychology": "BAPsych"
};

export const getProgramFromSectionName = (sectionName) => {
  if (!sectionName) return '';
  const lastHyphenIndex = sectionName.lastIndexOf('-');
  let programAbbr = '';
  if (lastHyphenIndex !== -1) {
    programAbbr = sectionName.slice(0, lastHyphenIndex).toUpperCase();
  } else {
    const match = sectionName.match(/^([A-Z-]+)(\d)([A-Z]*)$/i);
    if (match) {
      programAbbr = match[1].toUpperCase();
    }
  }
  
  if (!programAbbr) return '';
  
  const programName = Object.keys(PROGRAM_ABBREVIATIONS).find(
    key => PROGRAM_ABBREVIATIONS[key].toUpperCase() === programAbbr
  );
  return programName || '';
};
