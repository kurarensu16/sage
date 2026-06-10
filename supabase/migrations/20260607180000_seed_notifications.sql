-- Notification Seed Migration File
-- Truncating existing notifications to avoid duplication during seed
TRUNCATE TABLE notifications;

-- Admin Notifications for Admin System
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('61b23ba8-a479-45ed-b081-1246114e99ab', 'security', 'Critical administrative audit log: Manual database override detected on users table.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('61b23ba8-a479-45ed-b081-1246114e99ab', 'database_sync', 'Database auto-sync success: 12 class records successfully synchronized with registrar backend.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('61b23ba8-a479-45ed-b081-1246114e99ab', 'user_signup', 'New user registration: Faculty profile created for Prof. Maria Clara Ramos.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('61b23ba8-a479-45ed-b081-1246114e99ab', 'system', 'System notice: SAGE Platform Registry core updated to version 2.4.1.', true);

-- Dean Notifications for Carlos Valdes
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b10f0e0a-e904-4680-acf9-b97453842034', 'grades_pending', 'Prof. Amanda Rivera submitted final grade sheets for IT401 (Capstone Project 1) for your approval.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b10f0e0a-e904-4680-acf9-b97453842034', 'override_request', 'Professor Danilo Santos requested grade record correction for student.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b10f0e0a-e904-4680-acf9-b97453842034', 'eval_compiled', 'Student evaluation window closed. Consolidated faculty evaluation feedback is now compiled.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b10f0e0a-e904-4680-acf9-b97453842034', 'risk_threshold', 'At-risk warning: 12% of students in the College of Computer Studies are currently flagged on risk thresholds.', false);

-- Faculty Notifications for Joy Anastacio
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3bdb5c62-7a50-46f1-bb06-c50e319d9758', 'class_assigned', 'You have been assigned to instruct Capstone Project 1 (IT401 - BSIT-4A) for this term.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3bdb5c62-7a50-46f1-bb06-c50e319d9758', 'term_rollover_reminder', 'Urgent: Please submit all outstanding student grade sheets before the term rollover deadline.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3bdb5c62-7a50-46f1-bb06-c50e319d9758', 'override_approved', 'Your grade override request for student Sophia Bernardo has been approved by the Dean''s Office.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3bdb5c62-7a50-46f1-bb06-c50e319d9758', 'override_rejected', 'Your override request for student Ava Corpuz has been rejected by the Dean''s Office.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3bdb5c62-7a50-46f1-bb06-c50e319d9758', 'eval_window_open', 'Evaluation window open: Please encourage your students to complete the faculty evaluation survey.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3bdb5c62-7a50-46f1-bb06-c50e319d9758', 'risk_threshold', 'EWS alert: Student Carl Abalos in your section BSIT-1A has been flagged as at-risk.', false);

-- Faculty Notifications for Monica Arevalo
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cd26b0a5-eb2c-4097-9304-706e8c123153', 'class_assigned', 'You have been assigned to instruct Capstone Project 1 (IT401 - BSIT-4A) for this term.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cd26b0a5-eb2c-4097-9304-706e8c123153', 'term_rollover_reminder', 'Urgent: Please submit all outstanding student grade sheets before the term rollover deadline.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cd26b0a5-eb2c-4097-9304-706e8c123153', 'override_approved', 'Your grade override request for student Sophia Bernardo has been approved by the Dean''s Office.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cd26b0a5-eb2c-4097-9304-706e8c123153', 'override_rejected', 'Your override request for student Ava Corpuz has been rejected by the Dean''s Office.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cd26b0a5-eb2c-4097-9304-706e8c123153', 'eval_window_open', 'Evaluation window open: Please encourage your students to complete the faculty evaluation survey.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cd26b0a5-eb2c-4097-9304-706e8c123153', 'risk_threshold', 'EWS alert: Student Carl Abalos in your section BSIT-1A has been flagged as at-risk.', false);

-- Faculty Notifications for Sara Bustamante
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('662c4853-11d1-434e-912a-666a86037446', 'class_assigned', 'You have been assigned to instruct Capstone Project 1 (IT401 - BSIT-4A) for this term.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('662c4853-11d1-434e-912a-666a86037446', 'term_rollover_reminder', 'Urgent: Please submit all outstanding student grade sheets before the term rollover deadline.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('662c4853-11d1-434e-912a-666a86037446', 'override_approved', 'Your grade override request for student Sophia Bernardo has been approved by the Dean''s Office.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('662c4853-11d1-434e-912a-666a86037446', 'override_rejected', 'Your override request for student Ava Corpuz has been rejected by the Dean''s Office.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('662c4853-11d1-434e-912a-666a86037446', 'eval_window_open', 'Evaluation window open: Please encourage your students to complete the faculty evaluation survey.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('662c4853-11d1-434e-912a-666a86037446', 'risk_threshold', 'EWS alert: Student Carl Abalos in your section BSIT-1A has been flagged as at-risk.', false);

-- Faculty Notifications for Teresa Cruz
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('924d3d50-8f92-482f-90f1-c8e066374ef5', 'class_assigned', 'You have been assigned to instruct Capstone Project 1 (IT401 - BSIT-4A) for this term.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('924d3d50-8f92-482f-90f1-c8e066374ef5', 'term_rollover_reminder', 'Urgent: Please submit all outstanding student grade sheets before the term rollover deadline.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('924d3d50-8f92-482f-90f1-c8e066374ef5', 'override_approved', 'Your grade override request for student Sophia Bernardo has been approved by the Dean''s Office.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('924d3d50-8f92-482f-90f1-c8e066374ef5', 'override_rejected', 'Your override request for student Ava Corpuz has been rejected by the Dean''s Office.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('924d3d50-8f92-482f-90f1-c8e066374ef5', 'eval_window_open', 'Evaluation window open: Please encourage your students to complete the faculty evaluation survey.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('924d3d50-8f92-482f-90f1-c8e066374ef5', 'risk_threshold', 'EWS alert: Student Carl Abalos in your section BSIT-1A has been flagged as at-risk.', false);

-- Faculty Notifications for Lloyd Marquez
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e6763cbb-249a-41c0-ba5b-b5de6782248b', 'class_assigned', 'You have been assigned to instruct Capstone Project 1 (IT401 - BSIT-4A) for this term.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e6763cbb-249a-41c0-ba5b-b5de6782248b', 'term_rollover_reminder', 'Urgent: Please submit all outstanding student grade sheets before the term rollover deadline.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e6763cbb-249a-41c0-ba5b-b5de6782248b', 'override_approved', 'Your grade override request for student Sophia Bernardo has been approved by the Dean''s Office.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e6763cbb-249a-41c0-ba5b-b5de6782248b', 'override_rejected', 'Your override request for student Ava Corpuz has been rejected by the Dean''s Office.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e6763cbb-249a-41c0-ba5b-b5de6782248b', 'eval_window_open', 'Evaluation window open: Please encourage your students to complete the faculty evaluation survey.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e6763cbb-249a-41c0-ba5b-b5de6782248b', 'risk_threshold', 'EWS alert: Student Carl Abalos in your section BSIT-1A has been flagged as at-risk.', false);

-- Faculty Notifications for Fernando Miral
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('8fbe238d-8dcb-4378-a780-6c96d5291423', 'class_assigned', 'You have been assigned to instruct Capstone Project 1 (IT401 - BSIT-4A) for this term.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('8fbe238d-8dcb-4378-a780-6c96d5291423', 'term_rollover_reminder', 'Urgent: Please submit all outstanding student grade sheets before the term rollover deadline.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('8fbe238d-8dcb-4378-a780-6c96d5291423', 'override_approved', 'Your grade override request for student Sophia Bernardo has been approved by the Dean''s Office.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('8fbe238d-8dcb-4378-a780-6c96d5291423', 'override_rejected', 'Your override request for student Ava Corpuz has been rejected by the Dean''s Office.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('8fbe238d-8dcb-4378-a780-6c96d5291423', 'eval_window_open', 'Evaluation window open: Please encourage your students to complete the faculty evaluation survey.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('8fbe238d-8dcb-4378-a780-6c96d5291423', 'risk_threshold', 'EWS alert: Student Carl Abalos in your section BSIT-1A has been flagged as at-risk.', false);

-- Faculty Notifications for Maria Clara Ramos
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('637c3f70-b107-4340-bda7-8016119babe2', 'class_assigned', 'You have been assigned to instruct Capstone Project 1 (IT401 - BSIT-4A) for this term.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('637c3f70-b107-4340-bda7-8016119babe2', 'term_rollover_reminder', 'Urgent: Please submit all outstanding student grade sheets before the term rollover deadline.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('637c3f70-b107-4340-bda7-8016119babe2', 'override_approved', 'Your grade override request for student Sophia Bernardo has been approved by the Dean''s Office.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('637c3f70-b107-4340-bda7-8016119babe2', 'override_rejected', 'Your override request for student Ava Corpuz has been rejected by the Dean''s Office.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('637c3f70-b107-4340-bda7-8016119babe2', 'eval_window_open', 'Evaluation window open: Please encourage your students to complete the faculty evaluation survey.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('637c3f70-b107-4340-bda7-8016119babe2', 'risk_threshold', 'EWS alert: Student Carl Abalos in your section BSIT-1A has been flagged as at-risk.', false);

-- Faculty Notifications for Amanda Rivera
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3df18d7a-3ec7-4856-b5cd-3ca6d9104a74', 'class_assigned', 'You have been assigned to instruct Capstone Project 1 (IT401 - BSIT-4A) for this term.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3df18d7a-3ec7-4856-b5cd-3ca6d9104a74', 'term_rollover_reminder', 'Urgent: Please submit all outstanding student grade sheets before the term rollover deadline.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3df18d7a-3ec7-4856-b5cd-3ca6d9104a74', 'override_approved', 'Your grade override request for student Sophia Bernardo has been approved by the Dean''s Office.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3df18d7a-3ec7-4856-b5cd-3ca6d9104a74', 'override_rejected', 'Your override request for student Ava Corpuz has been rejected by the Dean''s Office.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3df18d7a-3ec7-4856-b5cd-3ca6d9104a74', 'eval_window_open', 'Evaluation window open: Please encourage your students to complete the faculty evaluation survey.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3df18d7a-3ec7-4856-b5cd-3ca6d9104a74', 'risk_threshold', 'EWS alert: Student Carl Abalos in your section BSIT-1A has been flagged as at-risk.', false);

-- Faculty Notifications for Danilo Santos
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('37e006bd-80ab-4b08-a989-0b892ef1ae9a', 'class_assigned', 'You have been assigned to instruct Capstone Project 1 (IT401 - BSIT-4A) for this term.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('37e006bd-80ab-4b08-a989-0b892ef1ae9a', 'term_rollover_reminder', 'Urgent: Please submit all outstanding student grade sheets before the term rollover deadline.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('37e006bd-80ab-4b08-a989-0b892ef1ae9a', 'override_approved', 'Your grade override request for student Sophia Bernardo has been approved by the Dean''s Office.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('37e006bd-80ab-4b08-a989-0b892ef1ae9a', 'override_rejected', 'Your override request for student Ava Corpuz has been rejected by the Dean''s Office.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('37e006bd-80ab-4b08-a989-0b892ef1ae9a', 'eval_window_open', 'Evaluation window open: Please encourage your students to complete the faculty evaluation survey.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('37e006bd-80ab-4b08-a989-0b892ef1ae9a', 'risk_threshold', 'EWS alert: Student Carl Abalos in your section BSIT-1A has been flagged as at-risk.', false);

-- Faculty Notifications for Emmanuel Vito Cruzz
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('10492bde-fe9a-476c-9c49-71c8bd56ad21', 'class_assigned', 'You have been assigned to instruct Capstone Project 1 (IT401 - BSIT-4A) for this term.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('10492bde-fe9a-476c-9c49-71c8bd56ad21', 'term_rollover_reminder', 'Urgent: Please submit all outstanding student grade sheets before the term rollover deadline.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('10492bde-fe9a-476c-9c49-71c8bd56ad21', 'override_approved', 'Your grade override request for student Sophia Bernardo has been approved by the Dean''s Office.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('10492bde-fe9a-476c-9c49-71c8bd56ad21', 'override_rejected', 'Your override request for student Ava Corpuz has been rejected by the Dean''s Office.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('10492bde-fe9a-476c-9c49-71c8bd56ad21', 'eval_window_open', 'Evaluation window open: Please encourage your students to complete the faculty evaluation survey.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('10492bde-fe9a-476c-9c49-71c8bd56ad21', 'risk_threshold', 'EWS alert: Student Carl Abalos in your section BSIT-1A has been flagged as at-risk.', false);

-- Student Notifications for Carl Abalos
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('69ceab9d-e508-4f0a-bf21-170f5764c4c6', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('69ceab9d-e508-4f0a-bf21-170f5764c4c6', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('69ceab9d-e508-4f0a-bf21-170f5764c4c6', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('69ceab9d-e508-4f0a-bf21-170f5764c4c6', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('69ceab9d-e508-4f0a-bf21-170f5764c4c6', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('69ceab9d-e508-4f0a-bf21-170f5764c4c6', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Miguel Ablaza
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('07703363-e56e-4876-9fd7-f79c1d3eb237', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('07703363-e56e-4876-9fd7-f79c1d3eb237', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('07703363-e56e-4876-9fd7-f79c1d3eb237', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('07703363-e56e-4876-9fd7-f79c1d3eb237', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('07703363-e56e-4876-9fd7-f79c1d3eb237', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('07703363-e56e-4876-9fd7-f79c1d3eb237', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Nathan Aguilar
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1d31e5a4-52e7-4f64-9961-b9df07b02613', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1d31e5a4-52e7-4f64-9961-b9df07b02613', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1d31e5a4-52e7-4f64-9961-b9df07b02613', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1d31e5a4-52e7-4f64-9961-b9df07b02613', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1d31e5a4-52e7-4f64-9961-b9df07b02613', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1d31e5a4-52e7-4f64-9961-b9df07b02613', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Hannah Bautista
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('184035cf-a553-41b2-aa78-aa0480a1cad1', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('184035cf-a553-41b2-aa78-aa0480a1cad1', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('184035cf-a553-41b2-aa78-aa0480a1cad1', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('184035cf-a553-41b2-aa78-aa0480a1cad1', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('184035cf-a553-41b2-aa78-aa0480a1cad1', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('184035cf-a553-41b2-aa78-aa0480a1cad1', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Sophia Bernardo
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('428e3b13-9146-47ff-afc4-49208acbe2db', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('428e3b13-9146-47ff-afc4-49208acbe2db', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('428e3b13-9146-47ff-afc4-49208acbe2db', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('428e3b13-9146-47ff-afc4-49208acbe2db', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('428e3b13-9146-47ff-afc4-49208acbe2db', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('428e3b13-9146-47ff-afc4-49208acbe2db', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Sofia Buenaventura
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e22f1c74-1ae9-48b3-b0bf-b1910fab03e3', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e22f1c74-1ae9-48b3-b0bf-b1910fab03e3', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e22f1c74-1ae9-48b3-b0bf-b1910fab03e3', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e22f1c74-1ae9-48b3-b0bf-b1910fab03e3', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e22f1c74-1ae9-48b3-b0bf-b1910fab03e3', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e22f1c74-1ae9-48b3-b0bf-b1910fab03e3', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Daniel Castillo
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1307efc9-b0f7-4067-9c66-7b00b87eb0bd', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1307efc9-b0f7-4067-9c66-7b00b87eb0bd', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1307efc9-b0f7-4067-9c66-7b00b87eb0bd', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1307efc9-b0f7-4067-9c66-7b00b87eb0bd', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1307efc9-b0f7-4067-9c66-7b00b87eb0bd', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1307efc9-b0f7-4067-9c66-7b00b87eb0bd', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for carlo celestino
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3bffe034-cbc2-4c41-b316-be0036c0b612', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3bffe034-cbc2-4c41-b316-be0036c0b612', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3bffe034-cbc2-4c41-b316-be0036c0b612', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3bffe034-cbc2-4c41-b316-be0036c0b612', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3bffe034-cbc2-4c41-b316-be0036c0b612', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3bffe034-cbc2-4c41-b316-be0036c0b612', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Ava Corpuz
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('de1d74fb-7444-46cd-89ee-19107560fd0e', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('de1d74fb-7444-46cd-89ee-19107560fd0e', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('de1d74fb-7444-46cd-89ee-19107560fd0e', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('de1d74fb-7444-46cd-89ee-19107560fd0e', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('de1d74fb-7444-46cd-89ee-19107560fd0e', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('de1d74fb-7444-46cd-89ee-19107560fd0e', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Lance Corpuz
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0e1fd441-43bc-4303-b0ad-fa119a647176', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0e1fd441-43bc-4303-b0ad-fa119a647176', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0e1fd441-43bc-4303-b0ad-fa119a647176', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0e1fd441-43bc-4303-b0ad-fa119a647176', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0e1fd441-43bc-4303-b0ad-fa119a647176', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0e1fd441-43bc-4303-b0ad-fa119a647176', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Juan Dela Cruz
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('95c5781f-6b0a-4f03-838f-692aa149894e', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('95c5781f-6b0a-4f03-838f-692aa149894e', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('95c5781f-6b0a-4f03-838f-692aa149894e', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('95c5781f-6b0a-4f03-838f-692aa149894e', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('95c5781f-6b0a-4f03-838f-692aa149894e', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('95c5781f-6b0a-4f03-838f-692aa149894e', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Camille Delos Reyes
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('46d29b5d-d659-4e04-a5a6-99d105ec4ee8', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('46d29b5d-d659-4e04-a5a6-99d105ec4ee8', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('46d29b5d-d659-4e04-a5a6-99d105ec4ee8', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('46d29b5d-d659-4e04-a5a6-99d105ec4ee8', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('46d29b5d-d659-4e04-a5a6-99d105ec4ee8', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('46d29b5d-d659-4e04-a5a6-99d105ec4ee8', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Chloe Domingo
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7a6ea86c-9e3d-4c50-9c82-2da8cdf2a3e6', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7a6ea86c-9e3d-4c50-9c82-2da8cdf2a3e6', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7a6ea86c-9e3d-4c50-9c82-2da8cdf2a3e6', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7a6ea86c-9e3d-4c50-9c82-2da8cdf2a3e6', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7a6ea86c-9e3d-4c50-9c82-2da8cdf2a3e6', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7a6ea86c-9e3d-4c50-9c82-2da8cdf2a3e6', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Paolo Enriquez
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('483ce233-bfbf-4bd3-938b-da86a499881a', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('483ce233-bfbf-4bd3-938b-da86a499881a', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('483ce233-bfbf-4bd3-938b-da86a499881a', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('483ce233-bfbf-4bd3-938b-da86a499881a', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('483ce233-bfbf-4bd3-938b-da86a499881a', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('483ce233-bfbf-4bd3-938b-da86a499881a', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Jacob Espinoza
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('da67e59d-b8d5-4ec3-a2a2-269abec97afe', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('da67e59d-b8d5-4ec3-a2a2-269abec97afe', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('da67e59d-b8d5-4ec3-a2a2-269abec97afe', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('da67e59d-b8d5-4ec3-a2a2-269abec97afe', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('da67e59d-b8d5-4ec3-a2a2-269abec97afe', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('da67e59d-b8d5-4ec3-a2a2-269abec97afe', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Samantha Fernandez
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('608af2db-8ed0-4bf0-b11f-3aa6c01da568', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('608af2db-8ed0-4bf0-b11f-3aa6c01da568', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('608af2db-8ed0-4bf0-b11f-3aa6c01da568', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('608af2db-8ed0-4bf0-b11f-3aa6c01da568', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('608af2db-8ed0-4bf0-b11f-3aa6c01da568', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('608af2db-8ed0-4bf0-b11f-3aa6c01da568', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Isabelle Flores
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0cfa8221-b37a-4970-8af5-e67a547bb1ab', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0cfa8221-b37a-4970-8af5-e67a547bb1ab', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0cfa8221-b37a-4970-8af5-e67a547bb1ab', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0cfa8221-b37a-4970-8af5-e67a547bb1ab', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0cfa8221-b37a-4970-8af5-e67a547bb1ab', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0cfa8221-b37a-4970-8af5-e67a547bb1ab', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for christian gabriel
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('604276b0-85a5-44b9-a2b1-1211b366639d', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('604276b0-85a5-44b9-a2b1-1211b366639d', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('604276b0-85a5-44b9-a2b1-1211b366639d', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('604276b0-85a5-44b9-a2b1-1211b366639d', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('604276b0-85a5-44b9-a2b1-1211b366639d', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('604276b0-85a5-44b9-a2b1-1211b366639d', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Christian Gabriel
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('86affeac-4c6a-4754-85c7-7a81452cef5e', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('86affeac-4c6a-4754-85c7-7a81452cef5e', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('86affeac-4c6a-4754-85c7-7a81452cef5e', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('86affeac-4c6a-4754-85c7-7a81452cef5e', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('86affeac-4c6a-4754-85c7-7a81452cef5e', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('86affeac-4c6a-4754-85c7-7a81452cef5e', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Adrian Garcia
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e56552fa-c1b8-48d7-bff6-c05df1cdd3f8', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e56552fa-c1b8-48d7-bff6-c05df1cdd3f8', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e56552fa-c1b8-48d7-bff6-c05df1cdd3f8', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e56552fa-c1b8-48d7-bff6-c05df1cdd3f8', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e56552fa-c1b8-48d7-bff6-c05df1cdd3f8', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e56552fa-c1b8-48d7-bff6-c05df1cdd3f8', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Maria Gonzales
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('4d355a40-04fd-49eb-a08e-04e99f51ed57', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('4d355a40-04fd-49eb-a08e-04e99f51ed57', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('4d355a40-04fd-49eb-a08e-04e99f51ed57', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('4d355a40-04fd-49eb-a08e-04e99f51ed57', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('4d355a40-04fd-49eb-a08e-04e99f51ed57', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('4d355a40-04fd-49eb-a08e-04e99f51ed57', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Andrei Guerrero
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('81377e5f-fc24-472a-96bc-dee9c77c7835', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('81377e5f-fc24-472a-96bc-dee9c77c7835', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('81377e5f-fc24-472a-96bc-dee9c77c7835', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('81377e5f-fc24-472a-96bc-dee9c77c7835', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('81377e5f-fc24-472a-96bc-dee9c77c7835', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('81377e5f-fc24-472a-96bc-dee9c77c7835', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Angela Hernandez
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('fb326e7e-1d0b-4966-8eca-9ebdb30ff58c', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('fb326e7e-1d0b-4966-8eca-9ebdb30ff58c', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('fb326e7e-1d0b-4966-8eca-9ebdb30ff58c', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('fb326e7e-1d0b-4966-8eca-9ebdb30ff58c', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('fb326e7e-1d0b-4966-8eca-9ebdb30ff58c', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('fb326e7e-1d0b-4966-8eca-9ebdb30ff58c', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Kristine Hidalgo
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e6a629cf-35bd-4e87-86d1-14ee97a405e3', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e6a629cf-35bd-4e87-86d1-14ee97a405e3', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e6a629cf-35bd-4e87-86d1-14ee97a405e3', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e6a629cf-35bd-4e87-86d1-14ee97a405e3', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e6a629cf-35bd-4e87-86d1-14ee97a405e3', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e6a629cf-35bd-4e87-86d1-14ee97a405e3', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Ryan Ilagan
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7678e464-b6b9-48f4-a64b-1671e9bbb0f8', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7678e464-b6b9-48f4-a64b-1671e9bbb0f8', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7678e464-b6b9-48f4-a64b-1671e9bbb0f8', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7678e464-b6b9-48f4-a64b-1671e9bbb0f8', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7678e464-b6b9-48f4-a64b-1671e9bbb0f8', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7678e464-b6b9-48f4-a64b-1671e9bbb0f8', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Jerome Imperial
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('25e3d6c3-0b21-4e5f-a5b0-90532f2872f4', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('25e3d6c3-0b21-4e5f-a5b0-90532f2872f4', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('25e3d6c3-0b21-4e5f-a5b0-90532f2872f4', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('25e3d6c3-0b21-4e5f-a5b0-90532f2872f4', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('25e3d6c3-0b21-4e5f-a5b0-90532f2872f4', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('25e3d6c3-0b21-4e5f-a5b0-90532f2872f4', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Alicia Javier
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('bf183e49-2d55-4840-8587-40f2c3e7333d', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('bf183e49-2d55-4840-8587-40f2c3e7333d', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('bf183e49-2d55-4840-8587-40f2c3e7333d', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('bf183e49-2d55-4840-8587-40f2c3e7333d', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('bf183e49-2d55-4840-8587-40f2c3e7333d', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('bf183e49-2d55-4840-8587-40f2c3e7333d', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Sarah Jenkins
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('43ecd392-3106-4291-a6f4-f5d496c4de42', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('43ecd392-3106-4291-a6f4-f5d496c4de42', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('43ecd392-3106-4291-a6f4-f5d496c4de42', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('43ecd392-3106-4291-a6f4-f5d496c4de42', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('43ecd392-3106-4291-a6f4-f5d496c4de42', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('43ecd392-3106-4291-a6f4-f5d496c4de42', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Patricia Jimenez
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7ad96b4f-3df5-4f0d-8ccc-8ffa89d913cd', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7ad96b4f-3df5-4f0d-8ccc-8ffa89d913cd', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7ad96b4f-3df5-4f0d-8ccc-8ffa89d913cd', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7ad96b4f-3df5-4f0d-8ccc-8ffa89d913cd', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7ad96b4f-3df5-4f0d-8ccc-8ffa89d913cd', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7ad96b4f-3df5-4f0d-8ccc-8ffa89d913cd', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Mary Johnson
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('99a9e4ca-c0d9-4009-989c-62506931f927', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('99a9e4ca-c0d9-4009-989c-62506931f927', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('99a9e4ca-c0d9-4009-989c-62506931f927', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('99a9e4ca-c0d9-4009-989c-62506931f927', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('99a9e4ca-c0d9-4009-989c-62506931f927', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('99a9e4ca-c0d9-4009-989c-62506931f927', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Marcus Katigbak
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e2fc3db3-3407-43db-9256-4b32e28613fb', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e2fc3db3-3407-43db-9256-4b32e28613fb', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e2fc3db3-3407-43db-9256-4b32e28613fb', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e2fc3db3-3407-43db-9256-4b32e28613fb', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e2fc3db3-3407-43db-9256-4b32e28613fb', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('e2fc3db3-3407-43db-9256-4b32e28613fb', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Kevin Lacson
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('8bd167f8-192f-4d80-a8da-0c167f839d42', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('8bd167f8-192f-4d80-a8da-0c167f839d42', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('8bd167f8-192f-4d80-a8da-0c167f839d42', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('8bd167f8-192f-4d80-a8da-0c167f839d42', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('8bd167f8-192f-4d80-a8da-0c167f839d42', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('8bd167f8-192f-4d80-a8da-0c167f839d42', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Denise Lim
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('2a4b64ab-3514-4d4d-a97e-f92551b178c2', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('2a4b64ab-3514-4d4d-a97e-f92551b178c2', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('2a4b64ab-3514-4d4d-a97e-f92551b178c2', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('2a4b64ab-3514-4d4d-a97e-f92551b178c2', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('2a4b64ab-3514-4d4d-a97e-f92551b178c2', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('2a4b64ab-3514-4d4d-a97e-f92551b178c2', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Ethan Macapagal
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('542dbfe2-ca85-4cc1-af17-d6d157604a57', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('542dbfe2-ca85-4cc1-af17-d6d157604a57', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('542dbfe2-ca85-4cc1-af17-d6d157604a57', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('542dbfe2-ca85-4cc1-af17-d6d157604a57', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('542dbfe2-ca85-4cc1-af17-d6d157604a57', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('542dbfe2-ca85-4cc1-af17-d6d157604a57', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Isabella Manalo
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b00a5c22-87fd-4a67-8cf9-4fd06f976157', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b00a5c22-87fd-4a67-8cf9-4fd06f976157', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b00a5c22-87fd-4a67-8cf9-4fd06f976157', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b00a5c22-87fd-4a67-8cf9-4fd06f976157', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b00a5c22-87fd-4a67-8cf9-4fd06f976157', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b00a5c22-87fd-4a67-8cf9-4fd06f976157', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Alyssa Mendoza
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('99c189dc-24df-4ffe-a0be-994dac8c5e4c', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('99c189dc-24df-4ffe-a0be-994dac8c5e4c', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('99c189dc-24df-4ffe-a0be-994dac8c5e4c', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('99c189dc-24df-4ffe-a0be-994dac8c5e4c', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('99c189dc-24df-4ffe-a0be-994dac8c5e4c', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('99c189dc-24df-4ffe-a0be-994dac8c5e4c', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Sean Navarro
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b7c6df1d-fa9b-4923-945d-fc6f7e0e4076', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b7c6df1d-fa9b-4923-945d-fc6f7e0e4076', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b7c6df1d-fa9b-4923-945d-fc6f7e0e4076', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b7c6df1d-fa9b-4923-945d-fc6f7e0e4076', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b7c6df1d-fa9b-4923-945d-fc6f7e0e4076', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b7c6df1d-fa9b-4923-945d-fc6f7e0e4076', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Carla Nieto
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('d381fb13-f728-4f60-a5df-ecb635c4b194', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('d381fb13-f728-4f60-a5df-ecb635c4b194', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('d381fb13-f728-4f60-a5df-ecb635c4b194', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('d381fb13-f728-4f60-a5df-ecb635c4b194', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('d381fb13-f728-4f60-a5df-ecb635c4b194', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('d381fb13-f728-4f60-a5df-ecb635c4b194', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Julia Ocampo
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cc5d7178-5d2b-45b2-b5b2-a40e5184c22d', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cc5d7178-5d2b-45b2-b5b2-a40e5184c22d', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cc5d7178-5d2b-45b2-b5b2-a40e5184c22d', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cc5d7178-5d2b-45b2-b5b2-a40e5184c22d', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cc5d7178-5d2b-45b2-b5b2-a40e5184c22d', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cc5d7178-5d2b-45b2-b5b2-a40e5184c22d', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Rafael Ong
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('39da7eb7-41d3-4050-9916-3d488b603b31', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('39da7eb7-41d3-4050-9916-3d488b603b31', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('39da7eb7-41d3-4050-9916-3d488b603b31', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('39da7eb7-41d3-4050-9916-3d488b603b31', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('39da7eb7-41d3-4050-9916-3d488b603b31', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('39da7eb7-41d3-4050-9916-3d488b603b31', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Matthew Padilla
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('9d9a4b12-81cb-4315-9e7a-460d1c76c894', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('9d9a4b12-81cb-4315-9e7a-460d1c76c894', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('9d9a4b12-81cb-4315-9e7a-460d1c76c894', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('9d9a4b12-81cb-4315-9e7a-460d1c76c894', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('9d9a4b12-81cb-4315-9e7a-460d1c76c894', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('9d9a4b12-81cb-4315-9e7a-460d1c76c894', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Ethan Pascual
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('bf4151f6-147d-49e6-b351-df8b83b59e65', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('bf4151f6-147d-49e6-b351-df8b83b59e65', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('bf4151f6-147d-49e6-b351-df8b83b59e65', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('bf4151f6-147d-49e6-b351-df8b83b59e65', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('bf4151f6-147d-49e6-b351-df8b83b59e65', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('bf4151f6-147d-49e6-b351-df8b83b59e65', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Vanessa Perez
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('40d14174-b91c-47a0-b99f-312d73d95555', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('40d14174-b91c-47a0-b99f-312d73d95555', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('40d14174-b91c-47a0-b99f-312d73d95555', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('40d14174-b91c-47a0-b99f-312d73d95555', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('40d14174-b91c-47a0-b99f-312d73d95555', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('40d14174-b91c-47a0-b99f-312d73d95555', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Mia Pineda
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a9f4662b-34b3-47ce-87fb-661906d5c042', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a9f4662b-34b3-47ce-87fb-661906d5c042', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a9f4662b-34b3-47ce-87fb-661906d5c042', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a9f4662b-34b3-47ce-87fb-661906d5c042', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a9f4662b-34b3-47ce-87fb-661906d5c042', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a9f4662b-34b3-47ce-87fb-661906d5c042', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Grace Poe
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('86c5e372-564a-4e16-a0b7-f16c4fb76524', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('86c5e372-564a-4e16-a0b7-f16c4fb76524', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('86c5e372-564a-4e16-a0b7-f16c4fb76524', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('86c5e372-564a-4e16-a0b7-f16c4fb76524', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('86c5e372-564a-4e16-a0b7-f16c4fb76524', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('86c5e372-564a-4e16-a0b7-f16c4fb76524', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Zoe Zoe
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aaa809e3-5961-4b88-9cf2-0a8086b6da61', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aaa809e3-5961-4b88-9cf2-0a8086b6da61', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aaa809e3-5961-4b88-9cf2-0a8086b6da61', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aaa809e3-5961-4b88-9cf2-0a8086b6da61', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aaa809e3-5961-4b88-9cf2-0a8086b6da61', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aaa809e3-5961-4b88-9cf2-0a8086b6da61', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Aaron Quirino
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('66816e29-b985-4054-bbc3-207fbddb266c', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('66816e29-b985-4054-bbc3-207fbddb266c', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('66816e29-b985-4054-bbc3-207fbddb266c', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('66816e29-b985-4054-bbc3-207fbddb266c', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('66816e29-b985-4054-bbc3-207fbddb266c', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('66816e29-b985-4054-bbc3-207fbddb266c', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Dylan Ramos
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('2f6a2b45-5744-4b4e-a6e3-1d0f76f871e2', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('2f6a2b45-5744-4b4e-a6e3-1d0f76f871e2', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('2f6a2b45-5744-4b4e-a6e3-1d0f76f871e2', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('2f6a2b45-5744-4b4e-a6e3-1d0f76f871e2', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('2f6a2b45-5744-4b4e-a6e3-1d0f76f871e2', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('2f6a2b45-5744-4b4e-a6e3-1d0f76f871e2', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Melissa Reyes
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3505b22e-1bbf-4a46-a1ba-92d552348b6d', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3505b22e-1bbf-4a46-a1ba-92d552348b6d', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3505b22e-1bbf-4a46-a1ba-92d552348b6d', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3505b22e-1bbf-4a46-a1ba-92d552348b6d', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3505b22e-1bbf-4a46-a1ba-92d552348b6d', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3505b22e-1bbf-4a46-a1ba-92d552348b6d', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Jose Reyes
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('f142b0ed-a6cf-4d4e-b764-3e11fd052fa4', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('f142b0ed-a6cf-4d4e-b764-3e11fd052fa4', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('f142b0ed-a6cf-4d4e-b764-3e11fd052fa4', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('f142b0ed-a6cf-4d4e-b764-3e11fd052fa4', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('f142b0ed-a6cf-4d4e-b764-3e11fd052fa4', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('f142b0ed-a6cf-4d4e-b764-3e11fd052fa4', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Leonor Robredo
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('339fe91a-60d0-4f2c-8f22-85fef171e3d4', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('339fe91a-60d0-4f2c-8f22-85fef171e3d4', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('339fe91a-60d0-4f2c-8f22-85fef171e3d4', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('339fe91a-60d0-4f2c-8f22-85fef171e3d4', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('339fe91a-60d0-4f2c-8f22-85fef171e3d4', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('339fe91a-60d0-4f2c-8f22-85fef171e3d4', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Mason Salvador
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a337b700-970c-4949-8390-557a388a439e', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a337b700-970c-4949-8390-557a388a439e', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a337b700-970c-4949-8390-557a388a439e', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a337b700-970c-4949-8390-557a388a439e', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a337b700-970c-4949-8390-557a388a439e', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a337b700-970c-4949-8390-557a388a439e', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Noah Santiago
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7f39531e-9059-40a4-80bd-63f1aa8ee88f', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7f39531e-9059-40a4-80bd-63f1aa8ee88f', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7f39531e-9059-40a4-80bd-63f1aa8ee88f', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7f39531e-9059-40a4-80bd-63f1aa8ee88f', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7f39531e-9059-40a4-80bd-63f1aa8ee88f', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('7f39531e-9059-40a4-80bd-63f1aa8ee88f', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Christian Santos
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('fb9194c1-6814-4d2b-9082-c5b2e1557936', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('fb9194c1-6814-4d2b-9082-c5b2e1557936', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('fb9194c1-6814-4d2b-9082-c5b2e1557936', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('fb9194c1-6814-4d2b-9082-c5b2e1557936', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('fb9194c1-6814-4d2b-9082-c5b2e1557936', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('fb9194c1-6814-4d2b-9082-c5b2e1557936', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Mark Santos
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('f8338128-b997-447d-95da-7de5874d218d', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('f8338128-b997-447d-95da-7de5874d218d', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('f8338128-b997-447d-95da-7de5874d218d', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('f8338128-b997-447d-95da-7de5874d218d', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('f8338128-b997-447d-95da-7de5874d218d', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('f8338128-b997-447d-95da-7de5874d218d', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Elijah Sarmiento
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b6fc9886-8c3a-49f0-a344-e4eb4fe7be40', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b6fc9886-8c3a-49f0-a344-e4eb4fe7be40', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b6fc9886-8c3a-49f0-a344-e4eb4fe7be40', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b6fc9886-8c3a-49f0-a344-e4eb4fe7be40', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b6fc9886-8c3a-49f0-a344-e4eb4fe7be40', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('b6fc9886-8c3a-49f0-a344-e4eb4fe7be40', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Kimberly Serrano
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cc403588-5360-421c-8648-bc0d1c75a86f', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cc403588-5360-421c-8648-bc0d1c75a86f', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cc403588-5360-421c-8648-bc0d1c75a86f', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cc403588-5360-421c-8648-bc0d1c75a86f', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cc403588-5360-421c-8648-bc0d1c75a86f', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('cc403588-5360-421c-8648-bc0d1c75a86f', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for John Smith
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0e2985f5-62a3-4c53-96d4-24c3904ce971', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0e2985f5-62a3-4c53-96d4-24c3904ce971', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0e2985f5-62a3-4c53-96d4-24c3904ce971', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0e2985f5-62a3-4c53-96d4-24c3904ce971', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0e2985f5-62a3-4c53-96d4-24c3904ce971', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('0e2985f5-62a3-4c53-96d4-24c3904ce971', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Liam Soriano
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aeacf3ae-3cf6-4576-8748-b54cd2d6bc7d', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aeacf3ae-3cf6-4576-8748-b54cd2d6bc7d', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aeacf3ae-3cf6-4576-8748-b54cd2d6bc7d', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aeacf3ae-3cf6-4576-8748-b54cd2d6bc7d', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aeacf3ae-3cf6-4576-8748-b54cd2d6bc7d', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aeacf3ae-3cf6-4576-8748-b54cd2d6bc7d', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Joshua Tan
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1679e3e7-6b9b-4d9c-b9ea-8fde95f7e557', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1679e3e7-6b9b-4d9c-b9ea-8fde95f7e557', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1679e3e7-6b9b-4d9c-b9ea-8fde95f7e557', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1679e3e7-6b9b-4d9c-b9ea-8fde95f7e557', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1679e3e7-6b9b-4d9c-b9ea-8fde95f7e557', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1679e3e7-6b9b-4d9c-b9ea-8fde95f7e557', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Emma Tolentino
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('29335427-2c05-45ea-bb1c-18c12d5442b2', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('29335427-2c05-45ea-bb1c-18c12d5442b2', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('29335427-2c05-45ea-bb1c-18c12d5442b2', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('29335427-2c05-45ea-bb1c-18c12d5442b2', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('29335427-2c05-45ea-bb1c-18c12d5442b2', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('29335427-2c05-45ea-bb1c-18c12d5442b2', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Lucas Torres
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a7bd36d3-1e0a-4cf7-89d0-6bb489ce4e97', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a7bd36d3-1e0a-4cf7-89d0-6bb489ce4e97', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a7bd36d3-1e0a-4cf7-89d0-6bb489ce4e97', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a7bd36d3-1e0a-4cf7-89d0-6bb489ce4e97', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a7bd36d3-1e0a-4cf7-89d0-6bb489ce4e97', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a7bd36d3-1e0a-4cf7-89d0-6bb489ce4e97', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Elaine Torres
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aa997c0c-8823-4c70-a14e-9ecfad3f1df3', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aa997c0c-8823-4c70-a14e-9ecfad3f1df3', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aa997c0c-8823-4c70-a14e-9ecfad3f1df3', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aa997c0c-8823-4c70-a14e-9ecfad3f1df3', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aa997c0c-8823-4c70-a14e-9ecfad3f1df3', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('aa997c0c-8823-4c70-a14e-9ecfad3f1df3', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Felix Umali
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1e76c652-9e9b-4ce7-b06a-36686454f1b6', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1e76c652-9e9b-4ce7-b06a-36686454f1b6', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1e76c652-9e9b-4ce7-b06a-36686454f1b6', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1e76c652-9e9b-4ce7-b06a-36686454f1b6', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1e76c652-9e9b-4ce7-b06a-36686454f1b6', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1e76c652-9e9b-4ce7-b06a-36686454f1b6', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Gabrielle Uy
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('9cf6a715-ecac-4bb0-b484-2f2dd0fb0008', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('9cf6a715-ecac-4bb0-b484-2f2dd0fb0008', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('9cf6a715-ecac-4bb0-b484-2f2dd0fb0008', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('9cf6a715-ecac-4bb0-b484-2f2dd0fb0008', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('9cf6a715-ecac-4bb0-b484-2f2dd0fb0008', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('9cf6a715-ecac-4bb0-b484-2f2dd0fb0008', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Olivia Valenzuela
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1c31b346-5f7d-4330-b0b5-3f859719332a', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1c31b346-5f7d-4330-b0b5-3f859719332a', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1c31b346-5f7d-4330-b0b5-3f859719332a', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1c31b346-5f7d-4330-b0b5-3f859719332a', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1c31b346-5f7d-4330-b0b5-3f859719332a', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('1c31b346-5f7d-4330-b0b5-3f859719332a', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Caleb Vargas
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('89659b65-302b-4cd3-a1a4-2d67927c2df5', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('89659b65-302b-4cd3-a1a4-2d67927c2df5', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('89659b65-302b-4cd3-a1a4-2d67927c2df5', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('89659b65-302b-4cd3-a1a4-2d67927c2df5', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('89659b65-302b-4cd3-a1a4-2d67927c2df5', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('89659b65-302b-4cd3-a1a4-2d67927c2df5', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Patricia Velasco
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('73afdc5c-6778-4784-8331-dca0abacdc09', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('73afdc5c-6778-4784-8331-dca0abacdc09', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('73afdc5c-6778-4784-8331-dca0abacdc09', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('73afdc5c-6778-4784-8331-dca0abacdc09', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('73afdc5c-6778-4784-8331-dca0abacdc09', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('73afdc5c-6778-4784-8331-dca0abacdc09', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Joel Villanueva
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3497afc2-d67e-4324-aebd-7e3572d408bc', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3497afc2-d67e-4324-aebd-7e3572d408bc', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3497afc2-d67e-4324-aebd-7e3572d408bc', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3497afc2-d67e-4324-aebd-7e3572d408bc', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3497afc2-d67e-4324-aebd-7e3572d408bc', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3497afc2-d67e-4324-aebd-7e3572d408bc', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Beatrice Wenceslao
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('665b5b4b-98ec-4e26-a4fd-4513ab4acfb2', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('665b5b4b-98ec-4e26-a4fd-4513ab4acfb2', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('665b5b4b-98ec-4e26-a4fd-4513ab4acfb2', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('665b5b4b-98ec-4e26-a4fd-4513ab4acfb2', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('665b5b4b-98ec-4e26-a4fd-4513ab4acfb2', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('665b5b4b-98ec-4e26-a4fd-4513ab4acfb2', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Jonathan Wick
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('4bbca054-7658-44eb-b8a9-6adcac7f21f7', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('4bbca054-7658-44eb-b8a9-6adcac7f21f7', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('4bbca054-7658-44eb-b8a9-6adcac7f21f7', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('4bbca054-7658-44eb-b8a9-6adcac7f21f7', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('4bbca054-7658-44eb-b8a9-6adcac7f21f7', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('4bbca054-7658-44eb-b8a9-6adcac7f21f7', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Brian Wijangco
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a07f1d3e-4b6c-43b5-91ec-c565217473a8', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a07f1d3e-4b6c-43b5-91ec-c565217473a8', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a07f1d3e-4b6c-43b5-91ec-c565217473a8', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a07f1d3e-4b6c-43b5-91ec-c565217473a8', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a07f1d3e-4b6c-43b5-91ec-c565217473a8', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('a07f1d3e-4b6c-43b5-91ec-c565217473a8', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Tristan Yap
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3aa59266-9a15-43f2-af82-06e14549ee26', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3aa59266-9a15-43f2-af82-06e14549ee26', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3aa59266-9a15-43f2-af82-06e14549ee26', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3aa59266-9a15-43f2-af82-06e14549ee26', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3aa59266-9a15-43f2-af82-06e14549ee26', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('3aa59266-9a15-43f2-af82-06e14549ee26', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

-- Student Notifications for Nicole Zamora
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('130d07a7-049f-4d6c-83ad-aea57be95f9c', 'class_enrolled', 'You have been successfully registered into Introduction to Computing (ITC113 - BSIT-1A).', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('130d07a7-049f-4d6c-83ad-aea57be95f9c', 'grade_posted', 'Your final grades for Capstone Project 1 (IT401) have been officially posted.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('130d07a7-049f-4d6c-83ad-aea57be95f9c', 'eval_window_open', 'Faculty evaluation period is now open. Please complete surveys for your instructors.', true);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('130d07a7-049f-4d6c-83ad-aea57be95f9c', 'eval_deadline_reminder', 'Survey reminder: 3 days left to submit evaluations for your instructors.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('130d07a7-049f-4d6c-83ad-aea57be95f9c', 'ews_alert', 'Early Warning System: You have been flagged as at-risk due to low exam scores.', false);
INSERT INTO notifications (recipient_id, type, message, is_read) VALUES ('130d07a7-049f-4d6c-83ad-aea57be95f9c', 'ai_recommendation', 'AI Counseling: Your customized academic counseling verdict is ready for review.', true);

