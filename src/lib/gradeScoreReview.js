const isBlankScore = (value) => value === '' || value === null || value === undefined;

const getActivityScore = (termScores, activity, index) => termScores[activity.id]
  ?? termScores[activity.dbId]
  ?? termScores[activity.slotKey]
  ?? termScores[`act${index + 1}`];

export function collectBlankScoreReview({
  targetMilestone,
  students,
  requiredTerms,
  activities,
  hasCharacter,
  hasExam = true,
  characterLabel,
  examLabel,
  getScoreRecord
}) {
  const affected = [];

  (students || []).forEach(student => {
    const scoreRecord = getScoreRecord(student) || {};
    const fields = [];

    requiredTerms.forEach(term => {
      const termScores = scoreRecord[term] || {};
      (activities[term] || []).forEach((activity, index) => {
        const value = getActivityScore(termScores, activity, index);
        if (isBlankScore(value)) {
          fields.push({
            term,
            key: activity.id || activity.dbId || `act${index + 1}`,
            label: activity.name || activity.title || `Activity ${index + 1}`
          });
        }
      });

      if (hasCharacter && isBlankScore(termScores.char)) {
        fields.push({ term, key: 'char', label: characterLabel });
      }
      if (hasExam && isBlankScore(termScores.exam)) {
        fields.push({ term, key: 'exam', label: examLabel });
      }
    });

    if (fields.length > 0) {
      affected.push({
        studentId: student.id,
        studentName: student.name,
        studentNumber: student.student_id_number || student.studentNo,
        fields
      });
    }
  });

  return {
    targetMilestone,
    requiredTerms,
    affected,
    fieldCount: affected.reduce((sum, item) => sum + item.fields.length, 0)
  };
}

export function prepareReviewedBlankScores({
  review,
  classRecordId,
  savedBy,
  activities,
  getScoreRecord
}) {
  const termRows = [];
  const activityRows = [];
  const stagedRecords = {};

  review.affected.forEach(item => {
    const source = getScoreRecord(item.studentId) || {};
    const staged = typeof structuredClone === 'function'
      ? structuredClone(source)
      : JSON.parse(JSON.stringify(source));

    item.fields.forEach(field => {
      staged[field.term] = { ...(staged[field.term] || {}), [field.key]: 0 };
    });
    stagedRecords[item.studentId] = staged;

    review.requiredTerms.forEach(term => {
      const termScores = staged[term] || {};
      const row = {
        class_record_id: classRecordId,
        student_id: item.studentId,
        term,
        char_rating: termScores.char ?? null,
        exam: termScores.exam ?? null,
        saved_by: savedBy
      };

      (activities[term] || []).forEach((activity, index) => {
        const value = getActivityScore(termScores, activity, index) ?? null;
        if (index < 6) row[`act${index + 1}`] = value;
        const activityId = activity.dbId || activity.id;
        if (activityId && typeof activityId === 'string' && activityId.length > 20 && value !== null) {
          activityRows.push({
            student_id: item.studentId,
            activity_id: activityId,
            score: Number(value)
          });
        }
      });
      termRows.push(row);
    });
  });

  return { termRows, activityRows, stagedRecords };
}
