import { useState } from "react";
import { useTranslation } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { useEditName } from "../model/use-edit-name";

export function EditNameForm() {
  const { editName, currentName, loading } = useEditName();
  const [value, setValue] = useState(currentName);
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await editName(value);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor="display-name" className="text-sm font-medium">
        {t("profile.displayName")}
      </label>
      <div className="flex gap-2">
        <input
          id="display-name"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder={t("profile.namePlaceholder")}
          disabled={loading}
        />
        <Button type="submit" disabled={loading || value.trim() === currentName}>
          {loading ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
