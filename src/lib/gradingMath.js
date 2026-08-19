// Transmute semestral rating to GWA (DYCI Standard)
export const getTransmutedGrade = (score) => {
  if (score === null || score === undefined || isNaN(score)) return 5.00;
  const numScore = parseFloat(score);
  if (numScore >= 98) return 1.00;
  if (numScore >= 95) return 1.25;
  if (numScore >= 92) return 1.50;
  if (numScore >= 89) return 1.75;
  if (numScore >= 86) return 2.00;
  if (numScore >= 83) return 2.25;
  if (numScore >= 80) return 2.50;
  if (numScore >= 77) return 2.75;
  if (numScore >= 75) return 3.00;
  return 5.00;
};
