import { useRef, useState } from 'react';
import { Camera, Edit2, Loader2, Phone, Trash2 } from 'lucide-react';
import UserAvatar from '../layout/UserAvatar';
import {
  formatContactNumber, normalizeContactNumber, removeAvatar, updateContactNumber, uploadAvatar
} from '../../lib/profileService';

const card = 'p-4 rounded-xl bg-slate-50 border border-slate-200/70';
const label = 'text-[10px] font-bold text-slate-400 uppercase tracking-wider block';
const smallButton = 'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

export default function ProfilePhotoAndContact({ userId, profile, initials, onUpdated }) {
  const fileInput = useRef(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState('');
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState('');

  async function choosePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setPhotoError('');
    try {
      await uploadAvatar(userId, file, profile?.avatar_path || null);
      await onUpdated?.();
    } catch (err) {
      setPhotoError(err.message || 'The photo could not be uploaded.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function deletePhoto() {
    setPhotoBusy(true);
    setPhotoError('');
    try {
      await removeAvatar(profile?.avatar_path || null);
      await onUpdated?.();
    } catch (err) {
      setPhotoError(err.message || 'The photo could not be removed.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function saveContact(event) {
    event.preventDefault();
    setContactError('');
    if (normalizeContactNumber(contactDraft) === undefined) {
      setContactError('Enter a Philippine mobile number such as 0917 123 4567, or leave it blank to remove it.');
      return;
    }
    setContactBusy(true);
    try {
      await updateContactNumber(contactDraft);
      await onUpdated?.();
      setEditingContact(false);
    } catch (err) {
      setContactError(err.message || 'The contact number could not be saved.');
    } finally {
      setContactBusy(false);
    }
  }

  return (
    <>
      <div className={card}>
        <span className={`${label} mb-3`}>Profile Photo</span>
        <div className="flex items-center gap-4">
          <UserAvatar
            path={profile?.avatar_path}
            initials={initials}
            className="w-16 h-16 bg-sage-800 text-white font-bold font-display text-lg"
          />
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={smallButton} disabled={photoBusy} onClick={() => fileInput.current?.click()}>
                {photoBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                {profile?.avatar_path ? 'Change photo' : 'Upload photo'}
              </button>
              {profile?.avatar_path && (
                <button type="button" className={smallButton} disabled={photoBusy} onClick={deletePhoto}>
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">Optional. JPG, PNG, or WebP up to 2 MB, cropped to a square. Stored privately and removable at any time.</p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={choosePhoto}
          />
        </div>
        {photoError && <p role="alert" className="mt-2 text-xs text-rose-700">{photoError}</p>}
      </div>

      <div className={card}>
        <div className="flex items-center justify-between mb-1">
          <span className={label}>Contact Number</span>
          {!editingContact && (
            <button
              type="button"
              className={smallButton}
              onClick={() => { setContactDraft(formatContactNumber(profile?.contact_number)); setContactError(''); setEditingContact(true); }}
            >
              <Edit2 className="h-3 w-3" /> {profile?.contact_number ? 'Edit' : 'Add'}
            </button>
          )}
        </div>
        {editingContact ? (
          <form onSubmit={saveContact} className="space-y-2 mt-2">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              value={contactDraft}
              onChange={event => setContactDraft(event.target.value)}
              placeholder="0917 123 4567"
              maxLength={20}
              disabled={contactBusy}
              className="block w-full px-3 py-2 border border-slate-200 focus:border-sage-500 rounded-lg text-sm outline-none focus:ring-1 focus:ring-sage-500 bg-white"
            />
            {contactError && <p role="alert" className="text-xs text-rose-700">{contactError}</p>}
            <div className="flex gap-2">
              <button type="submit" className={smallButton} disabled={contactBusy}>
                {contactBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Save
              </button>
              <button type="button" className={smallButton} disabled={contactBusy} onClick={() => setEditingContact(false)}>Cancel</button>
            </div>
            <p className="text-[11px] text-slate-500">Philippine mobile number. Leave blank and save to remove it.</p>
          </form>
        ) : (
          <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-slate-400" />
            {profile?.contact_number ? formatContactNumber(profile.contact_number) : <span className="font-medium text-slate-500">Not set</span>}
          </span>
        )}
      </div>
    </>
  );
}
