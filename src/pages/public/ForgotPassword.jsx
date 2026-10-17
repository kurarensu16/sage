import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SageLogo from '../../components/layout/SageLogo';
import { Mail, ArrowLeft, AlertCircle, KeyRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  const sendCode = async () => {
    // No account lookup before sending: public.users is not readable while logged out,
    // and confirming whether an email is registered would let anyone enumerate accounts.
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/resetpassword`
    });
    if (error) throw error;

    // Not logged to activity_logs: this runs unauthenticated, and the ledger only
    // accepts inserts from a signed-in user. Supabase Auth records the recovery
    // request itself, and the completed reset is logged from /resetpassword.
  };

  const handleRequestCode = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (!email.trim()) {
      setErrorMsg('Please specify your registered email address.');
      return;
    }

    setBusy(true);
    try {
      await sendCode();
      setStep('code');
    } catch (err) {
      console.error('Password reset request error:', err);
      setErrorMsg(err.message || 'An error occurred while sending the verification code.');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setBusy(true);
    try {
      await sendCode();
      setInfoMsg('A new verification code is on its way.');
    } catch (err) {
      console.error('Password reset resend error:', err);
      setErrorMsg(err.message || 'Could not send another code. Please wait a moment and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    const token = code.trim();
    // No exact length is enforced here: Supabase's email OTP length is a dashboard
    // setting (currently 8 digits), and hard-coding 6 silently truncated real codes so
    // verification could never succeed. Supabase rejects a wrong code anyway.
    if (token.length < 4) {
      setErrorMsg('Enter the verification code from your email.');
      return;
    }

    setBusy(true);
    try {
      // A verified recovery token signs the account in for recovery only, which is the
      // session /resetpassword needs in order to set the new password.
      const { error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token,
        type: 'recovery'
      });
      if (error) throw error;

      navigate('/resetpassword');
    } catch (err) {
      console.error('Password reset verification error:', err);
      setErrorMsg(err.message || 'That code is not valid or has expired. Request a new one.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="max-w-md w-full space-y-6">

        {/* Header logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex text-sage-900">
            <SageLogo className="h-24 w-24" />
          </div>
          <h2 className="text-3xl font-bold font-display text-slate-900 tracking-tight">
            Reset Password
          </h2>
          <p className="text-sm text-slate-500 max-w-xs mx-auto">
            {step === 'email'
              ? 'Provide your academic account email to receive a one-time verification code.'
              : 'Enter the verification code we emailed you.'}
          </p>
        </div>

        {/* Content Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-8 space-y-6">
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-100 text-rose-700 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="bg-sage-50 border border-sage-100 text-sage-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4 flex-shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleRequestCode} className="space-y-4">
              {/* Email address field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">University Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@sage.edu.ph"
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-slate-50/30 focus:bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-bold transition-all shadow-sm mt-4 cursor-pointer disabled:cursor-not-allowed"
              >
                {busy ? 'Sending code…' : 'Send Verification Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                We sent a one-time code to <strong className="text-slate-800 font-mono">{normalizedEmail}</strong>. It expires shortly, so enter it soon.
              </p>

              {/* Verification code field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Verification Code</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <KeyRound className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={10}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter code"
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-base font-mono tracking-widest outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-slate-50/30 focus:bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 bg-sage-600 hover:bg-sage-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-bold transition-all shadow-sm mt-4 cursor-pointer disabled:cursor-not-allowed"
              >
                {busy ? 'Verifying…' : 'Verify Code'}
              </button>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => { setStep('email'); setCode(''); setErrorMsg(''); setInfoMsg(''); }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  Use a different email
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={busy}
                  className="text-xs font-bold text-sage-700 hover:text-sage-900 transition-colors cursor-pointer disabled:text-slate-300 disabled:cursor-not-allowed"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}

          {/* Cancel/Back link */}
          <div className="text-center pt-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
