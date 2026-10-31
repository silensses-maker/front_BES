import type { RoleCatalogEntry, UserRole } from "@/shared/api/backend";
import { useTranslation } from "@/shared/i18n";
import { roleLabel } from "@/shared/i18n/enum-labels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

interface RoleSelectProps {
  value: UserRole;
  catalog: RoleCatalogEntry[];
  disabled?: boolean;
  /** Accessible name of the control, e.g. "Role of Ada". */
  label: string;
  onChange: (role: UserRole) => void;
}

/** The role of one user: the catalog's roles, highest first, with their translated names. */
export function RoleSelect({ value, catalog, disabled, label, onChange }: RoleSelectProps) {
  const { t } = useTranslation();
  // A role the catalog does not list (an older backend) still shows, so the select never blanks.
  const options = catalog.some((entry) => entry.role === value)
    ? catalog.map((entry) => entry.role)
    : [value, ...catalog.map((entry) => entry.role)];

  return (
    <Select value={value} onValueChange={(role) => onChange(role as UserRole)} disabled={disabled}>
      <SelectTrigger size="sm" className="h-8 w-44 text-xs" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((role) => (
          <SelectItem key={role} value={role} className="text-xs">
            {roleLabel(t, role)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
