import type { Dictionary } from "./en";

export const ar: Dictionary = {
  meta: {
    description: "النتائج والرسوم والسجلات المدرسية لمركز الجنة.",
  },
  common: {
    skipToContent: "انتقل إلى المحتوى الرئيسي",
    language: "اللغة",
    backToHome: "العودة إلى الصفحة الرئيسية",
    home: "الرئيسية",
  },
  landing: {
    eyebrow: "بوابة المدرسة",
    intro: "النتائج والرسوم والسجلات المدرسية لطلاب مركز الجنة وأسرهم وموظفيه.",
    actionsLabel: "اختر طريقة الدخول",
    studentPortal: {
      title: "بوابة الطالب وولي الأمر",
      description: "اطّلع على النتائج ورصيد الرسوم والسجل الدراسي.",
    },
    staffLogin: {
      title: "دخول الموظفين",
      description: "للمشرفين والموظفين الأكاديميين والماليين.",
    },
  },
  auth: {
    unavailable: "تسجيل الدخول غير متاح بعد، وسيُفعَّل في تحديث قادم.",
    student: {
      title: "بوابة الطالب وولي الأمر",
      subtitle: "سجّل الدخول برقم الطالب والرمز السري الصادرَين من المدرسة.",
      studentId: "رقم الطالب",
      studentIdHint: "مثال: {example}",
      pin: "الرمز السري",
      submit: "تسجيل الدخول",
    },
    staff: {
      title: "تسجيل دخول الموظفين",
      subtitle: "استخدم بريد العمل الإلكتروني وكلمة المرور.",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      submit: "تسجيل الدخول",
    },
  },
  footer: {
    copyright: "© {year} مركز الجنة",
  },
  notFound: {
    title: "الصفحة غير موجودة",
    body: "الصفحة التي تبحث عنها غير موجودة أو نُقلت.",
    action: "العودة إلى الصفحة الرئيسية للبوابة",
  },
};
