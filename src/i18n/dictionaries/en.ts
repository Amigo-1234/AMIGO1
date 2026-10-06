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
    unavailable: "Sign-in is not available yet. It will be enabled in an upcoming update.",
    student: {
      title: "Student / Parent Portal",
      subtitle: "Sign in with the student ID and PIN issued by the school.",
      studentId: "Student ID",
      studentIdHint: "For example {example}",
      pin: "PIN",
      submit: "Sign in",
    },
    staff: {
      title: "Staff sign in",
      subtitle: "Use your work email address and password.",
      email: "Email address",
      password: "Password",
      submit: "Sign in",
    },
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
