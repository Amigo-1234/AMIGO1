/**
 * English strings. This file defines the dictionary shape: every other language
 * must provide exactly the same keys (enforced by the `Dictionary` type).
 *
 * Placeholders use `{name}` and are filled with `interpolate()`.
 */
export const en = {
  meta: {
    description: "Results, fees and school records for Markaz il Ginna.",
  },
  common: {
    skipToContent: "Skip to main content",
    language: "Language",
    backToHome: "Back to home",
    home: "Home",
  },
  landing: {
    eyebrow: "School portal",
    intro:
      "Results, fees and school records for the students, families and staff of Markaz il Ginna.",
    actionsLabel: "Choose how to sign in",
    studentPortal: {
      title: "Student / Parent Portal",
      description: "View results, fee balance and academic history.",
    },
    staffLogin: {
      title: "Staff Login",
      description: "For administrators, academic and finance staff.",
    },
  },
  auth: {
    notConfigured: "Sign-in is not available yet. Please try again later.",
    submitting: "Signing in…",
    signOut: "Sign out",
    signingOut: "Signing out…",
    serverError: "Something went wrong. Please try again in a moment.",
    throttled: "Too many attempts. Please wait a few minutes before trying again.",
    sessionExpired: "Your session has ended. Please sign in again.",
    signedOut: "You have signed out.",
    student: {
      title: "Student / Parent Portal",
      subtitle: "Sign in with the student ID and PIN issued by the school.",
      studentId: "Student ID",
      studentIdHint: "For example {example}",
      pin: "PIN",
      pinHint: "6 digits",
      pinHintLegacy: "Your 6-digit PIN, or your old password if you have not set a PIN yet.",
      submit: "Sign in",
      invalidInput: "Enter the student ID and the 6-digit PIN.",
      invalidCredentials: "The student ID or PIN is incorrect.",
      unavailable: "This account cannot sign in at the moment. Please contact the school.",
    },
    setPin: {
      title: "Create your new PIN",
      subtitle:
        "For security, the old password can no longer be used. Choose a 6-digit PIN to use from now on.",
      newPin: "New PIN",
      confirmPin: "Confirm new PIN",
      submit: "Save PIN",
      submitting: "Saving…",
      invalidPin: "The PIN must be exactly 6 digits.",
      mismatch: "The two PINs do not match.",
      sessionInvalid: "This page has expired. Please sign in again with your old password.",
      saved: "Your new PIN is saved. Use it from now on.",
    },
    staff: {
      title: "Staff sign in",
      subtitle: "Use your work email address and password.",
      email: "Email address",
      password: "Password",
      submit: "Sign in",
      invalidInput: "Enter your email address and password.",
      invalidCredentials: "The email address or password is incorrect.",
      unmapped: "This account does not have staff access. Please contact a school administrator.",
      inactive: "This staff account is not active. Please contact a school administrator.",
    },
    setup: {
      title: "Set up the first administrator",
      subtitle:
        "This one-time page creates the school's first Super Admin. It closes permanently once setup is complete.",
      code: "Setup code",
      codeHint: "The STAFF_BOOTSTRAP_TOKEN value configured for this deployment.",
      fullName: "Full name",
      email: "Email address",
      password: "Password",
      passwordHint: "At least 8 characters.",
      submit: "Create administrator",
      submitting: "Creating…",
      invalidInput: "Fill in every field. The password needs at least 8 characters.",
      invalidCode: "The setup code is not valid.",
      verifyEmail:
        "Check your email to verify the address, then submit this form again with the same details.",
      accountError: "That email address and password could not be used. Check them and try again.",
      closed: "Setup has already been completed.",
    },
  },
  portal: {
    title: "Student portal",
    welcome: "Welcome, {name}",
    studentId: "Student ID",
    comingSoon: "Results, fees and academic history will appear here soon.",
  },
  admin: {
    title: "Staff area",
    signedInAs: "Signed in as",
    roles: "Roles",
    noRoles: "No roles assigned yet.",
    permissions: "Permissions",
    permissionCount: "{count} permissions",
    comingSoon: "The administration dashboard arrives in an upcoming phase.",
    denied: "You do not have permission to open that page.",
  },
  footer: {
    copyright: "© {year} Markaz il Ginna",
  },
  notFound: {
    title: "Page not found",
    body: "The page you are looking for does not exist or has moved.",
    action: "Return to the portal home",
  },
};

export type Dictionary = typeof en;
