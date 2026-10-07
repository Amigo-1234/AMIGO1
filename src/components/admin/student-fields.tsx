import { Checkbox, Input, Select, TextArea } from "@/components/admin/form";
import type { Dictionary } from "@/i18n/dictionaries";

type Initial = Partial<
  Record<
    "fullName" | "gender" | "dateOfBirth" | "phone" | "address" | "notes" | "admittedOn",
    string | null
  >
>;

/** The student's own details, shared by the registration and edit forms. */
export function StudentDetailFields({ t, initial = {} }: { t: Dictionary; initial?: Initial }) {
  const f = t.admin.fields;
  const optional = t.admin.common.optional;
  return (
    <>
      <Input
        name="fullName"
        label={f.fullName}
        initial={initial.fullName}
        required
        wide
        maxLength={120}
        autoComplete="off"
      />
      <Select
        name="gender"
        label={f.gender}
        optional={optional}
        initial={initial.gender}
        placeholder={f.genderUnset}
        options={[
          { value: "female", label: t.admin.gender.female },
          { value: "male", label: t.admin.gender.male },
        ]}
      />
      <Input
        name="dateOfBirth"
        type="date"
        label={f.dateOfBirth}
        optional={optional}
        initial={initial.dateOfBirth}
      />
      <Input
        name="phone"
        type="tel"
        label={f.phone}
        hint={f.phoneHint}
        optional={optional}
        initial={initial.phone}
        inputMode="tel"
        autoComplete="off"
        ltr
        maxLength={24}
      />
      <Input
        name="admittedOn"
        type="date"
        label={f.admittedOn}
        optional={optional}
        initial={initial.admittedOn}
      />
      <TextArea
        name="address"
        label={f.address}
        optional={optional}
        initial={initial.address}
        rows={2}
        maxLength={300}
      />
      <TextArea
        name="notes"
        label={f.notes}
        hint={f.notesHint}
        optional={optional}
        initial={initial.notes}
        maxLength={1000}
      />
    </>
  );
}

/** Guardian details, optionally with a field-name prefix (e.g. "guardian." on registration). */
export function GuardianFields({
  t,
  prefix = "",
  initial = {},
  withLink = true,
  primaryInitial = false,
}: {
  t: Dictionary;
  prefix?: string;
  initial?: Partial<
    Record<"fullName" | "phone" | "email" | "address" | "notes" | "relationship", string | null>
  >;
  withLink?: boolean;
  primaryInitial?: boolean;
}) {
  const f = t.admin.fields;
  const optional = t.admin.common.optional;
  const name = (field: string) => `${prefix}${field}`;
  return (
    <>
      <Input
        name={name("fullName")}
        label={f.fullName}
        initial={initial.fullName}
        wide
        maxLength={120}
      />
      {withLink && (
        <Input
          name={name("relationship")}
          label={f.relationship}
          hint={f.relationshipHint}
          optional={optional}
          initial={initial.relationship}
          maxLength={40}
        />
      )}
      <Input
        name={name("phone")}
        type="tel"
        label={f.phone}
        optional={optional}
        initial={initial.phone}
        inputMode="tel"
        ltr
        maxLength={24}
      />
      <Input
        name={name("email")}
        type="email"
        label={f.email}
        optional={optional}
        initial={initial.email}
        inputMode="email"
        ltr
        maxLength={254}
      />
      <TextArea
        name={name("address")}
        label={f.address}
        optional={optional}
        initial={initial.address}
        rows={2}
        maxLength={300}
      />
      {!prefix && (
        <TextArea
          name={name("notes")}
          label={f.notes}
          hint={f.notesHint}
          optional={optional}
          initial={initial.notes}
          maxLength={1000}
        />
      )}
      {withLink && (
        <PrimaryContact t={t} name={name("isPrimaryContact")} initial={primaryInitial} />
      )}
    </>
  );
}

function PrimaryContact({ t, name, initial }: { t: Dictionary; name: string; initial: boolean }) {
  return <Checkbox name={name} label={t.admin.fields.primaryContact} initial={initial} />;
}
