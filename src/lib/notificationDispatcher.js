import { supabase } from './supabase';

export const NOTIFICATION_TITLES = {
  grade_posted: 'New Grade Posted',
  grade_changed: 'Grade Updated',
  class_enrolled: 'Class Registration Success',
  class_join_declined: 'Enrollment Request Not Approved',
  class_join_request: 'New Enrollment Request',
  class_roster_added: 'Class Roster Update',
  eval_window_open: 'Faculty Evaluation Open',
  eval_closed: 'Faculty Evaluation Closed',
  eval_deadline_reminder: 'Evaluation Deadline Reminder',
  ews_alert: 'Early Warning System Alert',
  ai_recommendation: 'AI Study Tutor Insight Ready',
  class_assigned: 'New Class Assigned',
  term_rollover_reminder: 'Grade Submission Reminder',
  override_approved: 'Grade Override Approved',
  override_rejected: 'Grade Override Rejected',
  risk_threshold: 'At-Risk Threshold Alert',
  grades_pending: 'Grade Sheet Pending Approval',
  override_request: 'Grade Override Pending',
  eval_compiled: 'Evaluation Reports Compiled',
  compliance: 'Grading Compliance Alert',
  roster_import: 'Student Roster Processed',
  eval_window: 'Evaluation Window Status',
  assignment: 'Subject Assignment Update',
  consultation_request: 'New Consultation Request',
  academic_advising: 'Academic Advising Notice',
  dean_referral: 'Dean Referral Logged',
  academic_notice: 'Academic Notice',
  security: 'Administrative Security Alert',
  database_sync: 'Database Sync Success',
  user_signup: 'New User Registered',
  system: 'SAGE System Notice'
};

/**
 * Dispatch notifications through the database's validated SECURITY DEFINER RPC.
 * Clients never receive direct INSERT permission on the notifications table.
 * @param {Array<{ recipient_id: string, type: string, message: string, title?: string, link?: string, severity?: string, payload?: object, dedupe_key?: string }>} notificationList
 */
export async function dispatchNotifications(notificationList = []) {
  if (!notificationList || notificationList.length === 0) return;

  try {
    const formatted = notificationList
      .map(n => ({
        recipient_id: n.recipient_id || n.recipientId,
        type: n.type || 'system',
        message: n.message,
        title: n.title || NOTIFICATION_TITLES[n.type || 'system'] || 'SAGE Notification',
        link: n.link || null,
        severity: n.severity || 'info',
        payload: n.payload || {},
        dedupe_key: n.dedupe_key || null
      }))
      .filter(n => Boolean(n.recipient_id && n.message));

    if (formatted.length === 0) return;

    const { data: insertedRows, error } = await supabase
      .rpc('dispatch_notifications', { p_notifications: formatted });

    if (error) {
      throw error;
    }

    return insertedRows || [];
  } catch (err) {
    console.warn('Error dispatching notifications:', err);
    throw err;
  }
}

export async function markNotificationsRead(notificationIds = null) {
  const { error } = await supabase
    .rpc('mark_notifications_read', { p_notification_ids: notificationIds });
  if (error) throw error;
}

export async function dismissNotifications(notificationIds) {
  const { error } = await supabase
    .rpc('dismiss_notifications', { p_notification_ids: notificationIds });
  if (error) throw error;
}

export async function requeueNotificationDelivery(deliveryId) {
  const { error } = await supabase
    .rpc('requeue_notification_delivery', { p_delivery_id: deliveryId });
  if (error) throw error;
}

/**
 * Notify all students in a section, the assigned faculty, deans, and office actor when an evaluation window opens.
 */
export async function notifyEvaluationWindowOpen({
  sectionId,
  facultyId,
  subjectName = 'your class',
  sectionName = '',
  facultyName = '',
  actorId = null
}) {
  try {
    const notificationsToInsert = [];

    // 1. Fetch active students in the target section
    if (sectionId) {
      const { data: students } = await supabase
        .from('users')
        .select('user_id')
        .eq('role', 'student')
        .eq('status', 'active')
        .eq('section_id', sectionId);

      if (students && students.length > 0) {
        students.forEach(st => {
          notificationsToInsert.push({
            recipient_id: st.user_id,
            type: 'eval_window_open',
            message: `Faculty evaluation period is now open for ${subjectName || sectionName || 'your class'}. Please complete the survey for Prof. ${facultyName || 'your instructor'}.`
          });
        });
      }
    }

    // 2. Notify the faculty instructor
    if (facultyId) {
      notificationsToInsert.push({
        recipient_id: facultyId,
        type: 'eval_window_open',
        message: `Evaluation window open: Evaluation period for ${sectionName || 'your section'} (${subjectName || ''}) is now active. Please encourage your students to submit their evaluation surveys.`
      });
    }

    // 3. Notify College Deans
    const { data: deans } = await supabase
      .from('users')
      .select('user_id')
      .eq('role', 'dean')
      .eq('status', 'active');
    
    if (deans && deans.length > 0) {
      deans.forEach(d => {
        notificationsToInsert.push({
          recipient_id: d.user_id,
          type: 'eval_window_open',
          message: `Evaluation window published for section ${sectionName || ''} (Prof. ${facultyName || 'Instructor'}).`
        });
      });
    }

    // 4. Notify Office Staff Actor
    if (actorId) {
      notificationsToInsert.push({
        recipient_id: actorId,
        type: 'eval_window',
        message: `Evaluation window successfully published for section ${sectionName || ''} (Prof. ${facultyName || 'Instructor'}).`
      });
    }

    await dispatchNotifications(notificationsToInsert);
  } catch (err) {
    console.warn('Error in notifyEvaluationWindowOpen:', err);
  }
}

/**
 * @deprecated Unused as of 2026-10-02. ScoreInput.jsx and GradeComputationPreview.jsx used to
 * call this (with no dedupe_key) alongside the already-deduped notifyGradePosted(), causing
 * every student to receive two notifications on first post. Both call sites now use
 * notifyGradePosted() (first post / idempotent re-post) and notifyGradeChanged() (relock with
 * an actual change) exclusively. Kept here only in case something still imports it; do not
 * wire this back in — it has no dedupe_key and targets by section rather than by the real
 * per-student roster, independent of whether a student is actually enrolled in this class.
 */
export async function notifyGradesPosted({
  sectionId,
  subjectCode = '',
  termName = 'Final',
  facultyName = '',
  studentIds = null,
  isUpdate = false
}) {
  try {
    let targetUserIds = [];

    if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
      targetUserIds = studentIds;
    } else if (sectionId) {
      const { data: students } = await supabase
        .from('users')
        .select('user_id')
        .eq('role', 'student')
        .eq('status', 'active')
        .eq('section_id', sectionId);

      if (students) {
        targetUserIds = students.map(st => st.user_id);
      }
    }

    if (targetUserIds.length > 0) {
      const actionText = isUpdate ? 'updated' : 'posted';
      const list = targetUserIds.map(uid => ({
        recipient_id: uid,
        type: 'grade_posted',
        message: `Your ${termName} grades for ${subjectCode || 'your class'} have been ${actionText} by Prof. ${facultyName || 'your instructor'} for consultation.`
      }));
      await dispatchNotifications(list);
    }
  } catch (err) {
    console.warn('Error in notifyGradesPosted:', err);
  }
}

/**
 * Notify students, faculty, deans, and office staff when an evaluation window is closed.
 */
export async function notifyEvaluationWindowClosed({
  sectionId,
  facultyId,
  subjectName = 'your class',
  sectionName = '',
  facultyName = '',
  actorId = null
}) {
  try {
    const notificationsToInsert = [];

    // 1. Notify enrolled students in target section
    if (sectionId) {
      const { data: students } = await supabase
        .from('users')
        .select('user_id')
        .eq('role', 'student')
        .eq('status', 'active')
        .eq('section_id', sectionId);

      if (students && students.length > 0) {
        students.forEach(st => {
          notificationsToInsert.push({
            recipient_id: st.user_id,
            type: 'eval_closed',
            message: `The faculty evaluation survey period for ${subjectName || sectionName || 'your class'} (Prof. ${facultyName || 'Instructor'}) has officially closed. Thank you for your submission!`
          });
        });
      }
    }

    // 2. Notify assigned faculty
    if (facultyId) {
      notificationsToInsert.push({
        recipient_id: facultyId,
        type: 'eval_compiled',
        message: `Evaluation window closed: Surveys for section ${sectionName || 'your section'} are now closed. Student evaluation responses have been compiled.`
      });
    }

    // 3. Notify Deans
    const { data: deans } = await supabase
      .from('users')
      .select('user_id')
      .eq('role', 'dean')
      .eq('status', 'active');
    
    if (deans && deans.length > 0) {
      deans.forEach(d => {
        notificationsToInsert.push({
          recipient_id: d.user_id,
          type: 'eval_compiled',
          message: `Student evaluation window closed for section ${sectionName || ''} (Prof. ${facultyName || 'Instructor'}). Evaluation reports are compiled.`
        });
      });
    }

    // 4. Notify Office Staff Actor
    if (actorId) {
      notificationsToInsert.push({
        recipient_id: actorId,
        type: 'eval_window',
        message: `Evaluation window closed for section ${sectionName || ''} (Prof. ${facultyName || 'Instructor'}).`
      });
    }

    await dispatchNotifications(notificationsToInsert);
  } catch (err) {
    console.warn('Error in notifyEvaluationWindowClosed:', err);
  }
}

/**
 * Notify administrators and target user when accounts are disabled, enabled, or archived.
 */
export async function notifyUserStatusChange({
  targetUserName = 'User',
  targetUserEmail = '',
  targetRole = 'user',
  targetUserId = null,
  newStatus = 'inactive',
  actorName = 'Administrator'
}) {
  try {
    const notificationsToInsert = [];
    const statusAction = newStatus === 'inactive' ? 'disabled' : newStatus === 'active' ? 'enabled' : newStatus === 'archived' ? 'archived' : newStatus;

    // 1. Notify all Administrators (Security Notice)
    const { data: admins } = await supabase
      .from('users')
      .select('user_id')
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      admins.forEach(adm => {
        notificationsToInsert.push({
          recipient_id: adm.user_id,
          type: 'security',
          message: `Security Notice: ${targetRole.toUpperCase()} account for ${targetUserName} (${targetUserEmail}) was ${statusAction} by ${actorName}.`
        });
      });
    }

    // 2. Notify the affected user
    if (targetUserId) {
      notificationsToInsert.push({
        recipient_id: targetUserId,
        type: 'security',
        message: newStatus === 'inactive'
          ? `Security Notice: Your SAGE institutional account has been temporarily disabled by ${actorName}. Please contact your administrator if you have questions.`
          : newStatus === 'archived'
          ? `Security Notice: Your SAGE institutional account has been archived by ${actorName}.`
          : `Security Notice: Your SAGE institutional account has been re-activated by ${actorName}.`
      });
    }

    await dispatchNotifications(notificationsToInsert);
  } catch (err) {
    console.warn('Error in notifyUserStatusChange:', err);
  }
}

/**
 * Notify all administrators regarding core administrative operations
 * (Subjects Database, Sections Database, Grade Computation Templates, Term Management, Overrides).
 */
export async function notifyAdminActivity({
  type = 'system', // 'system' | 'security' | 'database_sync'
  message = '',
  actorName = 'Administrator'
}) {
  try {
    if (!message) return;

    const { data: admins } = await supabase
      .from('users')
      .select('user_id')
      .eq('role', 'admin');

    if (!admins || admins.length === 0) return;

    const notificationsToInsert = admins.map(adm => ({
      recipient_id: adm.user_id,
      type,
      message
    }));

    await dispatchNotifications(notificationsToInsert);
  } catch (err) {
    console.warn('Error in notifyAdminActivity:', err);
  }
}

/**
 * Notify Dean that a faculty member requested a remark override.
 */
export async function notifyOverrideRequested({
  deanId = null,
  departmentId = null,
  facultyName = 'Faculty',
  studentName = 'Student',
  subjectName = 'Subject',
  currentRemark = '',
  requestedRemark = 'Pending Edit'
}) {
  // Names the student and their remark transition, so it is locked to the college that
  // owns the class. The scope key is the SECTION's department, because that is the rule
  // the database itself enforces on reads: is_authorized_dean_for_class gates
  // remark_override_requests on `actor.department_id = section.department_id`
  // (20261008180000_grading_authorization_hardening.sql:60). Scoping on anything else
  // would notify deans who cannot open the request.
  const detailMessage = `Remark Override Request: Prof. ${facultyName} submitted a request for ${studentName} (${currentRemark} → ${requestedRemark}) in ${subjectName}.`;

  try {
    const list = [];
    if (deanId) {
      list.push({
        recipient_id: deanId,
        type: 'override_request',
        message: detailMessage
      });
    } else {
      let deanQuery = supabase
        .from('users')
        .select('user_id')
        .eq('role', 'dean')
        .eq('status', 'active');

      if (departmentId) {
        deanQuery = deanQuery.eq('department_id', departmentId);
      }

      const { data: deans } = await deanQuery;

      if (deans && deans.length > 0) {
        deans.forEach(d => {
          list.push({
            recipient_id: d.user_id,
            type: 'override_request',
            message: detailMessage
          });
        });
      } else if (departmentId) {
        // The college has no active dean, so no scoped reviewer exists and the request
        // would otherwise go unseen. It escalates to admins instead of to other colleges'
        // deans, which keeps the student's name and remark locked to the owning college.
        //
        // Admins are the correct escalation: is_active_admin() can read the request
        // (20261008180000_grading_authorization_hardening.sql:502) but
        // review_sg_correction_request rejects them with 42501, 'Only an active Dean may
        // review an SG correction request'. So the actionable step is assigning a dean to
        // that college, and the message says exactly that rather than implying approval.
        const { data: admins } = await supabase
          .from('users')
          .select('user_id')
          .eq('role', 'admin')
          .eq('status', 'active');

        (admins || []).forEach(a => {
          list.push({
            recipient_id: a.user_id,
            type: 'override_request',
            message: `Remark Override Request: Prof. ${facultyName} submitted a grade correction request in ${subjectName}, but no active Dean is assigned to that college. Assign a Dean so the request can be reviewed.`
          });
        });
      }
    }
    await dispatchNotifications(list);
  } catch (err) {
    console.warn('Error in notifyOverrideRequested:', err);
  }
}

/**
 * Notify Faculty when Dean approves a correction request. Approval grants
 * one student-scoped correction permission; the student is notified only after
 * faculty applies the revised score row and the server posts the recalculation.
 */
export async function notifyOverrideApproved({
  facultyId,
  studentName = 'Student',
  subjectName = 'Subject',
  requestedRemark = 'Passed',
  proposedComputedGrade = null,
  proposedEffectiveGrade = null,
  actorName = 'Dean'
}) {
  try {
    const list = [];
    if (facultyId) {
      list.push({
        recipient_id: facultyId,
        type: 'override_approved',
        message: `Correction Request Approved: ${actorName} authorized one correction transaction for ${studentName} in ${subjectName}. You may now edit that student's score row; the server will recalculate SG, GWA, and status and relock the record when applied. Requested outcome: ${proposedComputedGrade ?? 'current'}% / GWA ${proposedEffectiveGrade ?? 'current'} / ${requestedRemark}.`
      });
    }
    await dispatchNotifications(list);
  } catch (err) {
    console.warn('Error in notifyOverrideApproved:', err);
  }
}

/**
 * Notify Faculty when Dean rejects a remark override.
 */
export async function notifyOverrideRejected({
  facultyId,
  studentName = 'Student',
  subjectName = 'Subject',
  reason = '',
  actorName = 'Dean'
}) {
  try {
    if (!facultyId) return;
    await dispatchNotifications([{
      recipient_id: facultyId,
      type: 'override_rejected',
      message: `Override Request Declined: Your remark override request for ${studentName} in ${subjectName} was declined by ${actorName}.${reason ? ` Reason: ${reason}` : ''}`
    }]);
  } catch (err) {
    console.warn('Error in notifyOverrideRejected:', err);
  }
}

/** Notify the reviewing Dean only after an approved SG correction is applied. */
export async function notifyOverrideApplied({
  deanId,
  studentName = 'Student',
  subjectName = 'Subject',
  finalRemark = ''
}) {
  try {
    if (!deanId) return;
    await dispatchNotifications([{
      recipient_id: deanId,
      type: 'override_approved',
      message: `Approved SG Correction Applied: ${studentName}'s corrected semestral grade in ${subjectName} was reposted and relocked${finalRemark ? ` with the remark ${finalRemark}` : ''}.`
    }]);
  } catch (err) {
    console.warn('Error in notifyOverrideApplied:', err);
  }
}

/**
 * Notify Dean when Faculty requests a milestone unlock.
 */
export async function notifyUnlockRequested({
  deanId = null,
  facultyName = 'Faculty',
  subjectName = 'Subject',
  milestone = 'Semestral Grade'
}) {
  try {
    const list = [];
    if (deanId) {
      list.push({
        recipient_id: deanId,
        type: 'grades_pending',
        message: `Unlock Request: Prof. ${facultyName} requested permission to unlock ${milestone} grades for ${subjectName}.`
      });
    } else {
      const { data: deans } = await supabase
        .from('users')
        .select('user_id')
        .eq('role', 'dean')
        .eq('status', 'active');
      
      if (deans && deans.length > 0) {
        deans.forEach(d => {
          list.push({
            recipient_id: d.user_id,
            type: 'grades_pending',
            message: `Unlock Request: Prof. ${facultyName} requested permission to unlock ${milestone} grades for ${subjectName}.`
          });
        });
      }
    }
    await dispatchNotifications(list);
  } catch (err) {
    console.warn('Error in notifyUnlockRequested:', err);
  }
}

/**
 * Notify Faculty when Dean approves milestone unlock.
 */
export async function notifyUnlockApproved({
  facultyId,
  subjectName = 'Subject',
  milestone = 'Semestral Grade',
  actorName = 'Dean'
}) {
  try {
    if (!facultyId) return;
    await dispatchNotifications([{
      recipient_id: facultyId,
      type: 'system',
      message: `Grade Registry Unlocked: ${actorName} approved your unlock request for ${milestone} in ${subjectName}. You may now update score sheets.`
    }]);
  } catch (err) {
    console.warn('Error in notifyUnlockApproved:', err);
  }
}

/**
 * Notify Student and Faculty when Admin performs a direct grade override.
 */
export async function notifyAdminGradeOverride({
  studentId,
  facultyId = null,
  studentName = 'Student',
  subjectCode = '',
  subjectName = '',
  classRecordId = null,
  overrideAt = null,
  oldGrade = 0,
  newGrade = 0,
  remarks = '',
  actorName = 'Administrator'
}) {
  try {
    const list = [];
    if (studentId) {
      // grade_changed (not grade_posted) so the email and guardian copy say
      // "Grade updated" and name the subject, like a faculty correction.
      list.push({
        recipient_id: studentId,
        type: 'grade_changed',
        severity: 'warning',
        title: 'Grade Updated',
        link: '/student/grades',
        message: `Administrative Grade Update: Your official ${subjectCode} grade was updated to ${Number(newGrade).toFixed(2)} (${remarks}) by ${actorName}.`,
        payload: {
          subject_code: subjectCode,
          subject_name: subjectName || subjectCode,
          term: 'Semestral Grade',
          remark: remarks,
          gwa: Number.isFinite(Number(newGrade)) ? Number(newGrade) : null,
          student_name: studentName || null,
          class_record_id: classRecordId,
          source: 'admin_override'
        },
        dedupe_key: `grade_changed:${classRecordId || subjectCode}:semestral_grade:${studentId}:override:${overrideAt || Date.now()}`
      });
    }
    if (facultyId) {
      list.push({
        recipient_id: facultyId,
        type: 'compliance',
        message: `Compliance Notice: Administrative grade adjustment executed for ${studentName} in ${subjectCode} (${Number(oldGrade).toFixed(2)} → ${Number(newGrade).toFixed(2)}) by ${actorName}.`
      });
    }
    await dispatchNotifications(list);
  } catch (err) {
    console.warn('Error in notifyAdminGradeOverride:', err);
  }
}

/**
 * Notify Faculty and Deans when an academic term is activated or rolled over.
 */
export async function notifyTermActivated({
  termName = '',
  schoolYear = '',
  semester = '',
  actorName = 'Administrator'
}) {
  try {
    const { data: targetUsers } = await supabase
      .from('users')
      .select('user_id, role')
      .in('role', ['faculty', 'dean'])
      .eq('status', 'active');

    if (!targetUsers || targetUsers.length === 0) return;

    const list = targetUsers.map(u => ({
      recipient_id: u.user_id,
      type: 'term_rollover_reminder',
      message: `Academic Term Activated: ${schoolYear} ${semester}${termName ? ` (${termName})` : ''} has been officially set active by ${actorName}.`
    }));

    await dispatchNotifications(list);
  } catch (err) {
    console.warn('Error in notifyTermActivated:', err);
  }
}

/**
 * Notify all administrators and office actor when batch roster import is completed.
 */
export async function notifyRosterImported({
  count = 0,
  departmentName = '',
  actorName = 'College Office'
}) {
  try {
    const { data: admins } = await supabase
      .from('users')
      .select('user_id')
      .eq('role', 'admin')
      .eq('status', 'active');

    if (!admins || admins.length === 0) return;

    const list = admins.map(adm => ({
      recipient_id: adm.user_id,
      type: 'roster_import',
      message: `Roster Synchronization: ${count} member(s) synchronized into ${departmentName || 'institution'} by ${actorName}.`
    }));

    await dispatchNotifications(list);
  } catch (err) {
    console.warn('Error in notifyRosterImported:', err);
  }
}

/**
 * Notify all students in a class when a grade milestone is locked.
 * Idempotent: safe to call again after an unlock -> relock cycle.
 * Uses upsert with onConflict on dedupe_key (supabase-js v2 compliant).
 *
 * @param {{ classRecordId: string, term: string, students: Array<{ student_id: string, remark?: string }>, subject: { code: string, name: string } }} params
 */
export async function notifyGradePosted({ classRecordId, term, students, subject }) {
  if (!students?.length) return;

  // `message` is the full-detail, authenticated in-app inbox text — per
  // NOTIFICATION_DELIVERY_ARCHITECTURE.md §6/item (i), it carries the remark plus a
  // prompt to consult an adviser. Deliberately NOT an auto-generated "you may need
  // to shift courses" judgment call — that's a human adviser's call, never the
  // system's. Because this field also feeds the device push banner (see
  // AuthContext.jsx's triggerInboundLocalNotification), 'grade_posted' is in that
  // file's SENSITIVE_PUSH_TYPES denylist so the lock screen still only shows a
  // generic event notice, never this remark.
  const rows = students.map((s) => {
    const numRating = (s.rating !== null && s.rating !== undefined && s.rating !== '') ? Number(s.rating) : null
    const numGwa = (s.gwa !== null && s.gwa !== undefined && s.gwa !== '') ? Number(s.gwa) : null
    return {
      recipient_id: s.student_id,
      type:         'grade_posted',
      severity:     'info',
      title:        'New Grade Posted',
      link:         '/student/grades',
      message:      `Your ${term} grade for ${subject.name} (${subject.code}) has been posted. Remark: ${s.remark || 'Posted'}. If you have questions about your academic standing, please consult your adviser.`,
      payload: {
        subject_code:    subject.code,
        subject_name:    subject.name,
        term,
        remark:          s.remark || 'Posted',
        rating:          Number.isFinite(numRating) ? numRating : null,
        gwa:             Number.isFinite(numGwa) ? numGwa : null,
        student_name:    s.student_name || null,
        class_record_id: classRecordId,
      },
      dedupe_key: `grade_posted:${classRecordId}:${term}:${s.student_id}`,
    }
  });

  await dispatchNotifications(rows);
}

/**
 * Notify a student when a posted grade is changed (unlock -> edit -> relock).
 * Uses a revision counter in the dedupe key so each correction fires once.
 *
 * @param {{ classRecordId: string, term: string, studentId: string, subject: { code: string, name: string }, remark: string, revision: number }} params
 */
export async function notifyGradeChanged({ classRecordId, term, studentId, studentName, subject, remark, rating, gwa, revision }) {
  const numRating = (rating !== null && rating !== undefined && rating !== '') ? Number(rating) : null
  const numGwa = (gwa !== null && gwa !== undefined && gwa !== '') ? Number(gwa) : null

  // Same full-detail-in-message / generic-push-banner split as notifyGradePosted
  // above — 'grade_changed' is also in AuthContext.jsx's SENSITIVE_PUSH_TYPES.
  await dispatchNotifications([{
      recipient_id: studentId,
      type:         'grade_changed',
      severity:     'warning',
      title:        'Grade Updated',
      link:         '/student/grades',
      message:      `Your ${term} grade for ${subject.name} (${subject.code}) has been updated. Remark: ${remark}. If you have questions about your academic standing, please consult your adviser.`,
      payload: {
        subject_code:    subject.code,
        subject_name:    subject.name,
        term,
        remark,
        rating:          Number.isFinite(numRating) ? numRating : null,
        gwa:             Number.isFinite(numGwa) ? numGwa : null,
        student_name:    studentName || null,
        class_record_id: classRecordId,
        revision,
      },
      dedupe_key: `grade_changed:${classRecordId}:${term}:${studentId}:rev${revision}`,
    }]);
}




