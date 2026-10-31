import { beforeEach, describe, expect, it } from "vitest";
import { useAdminUsersSheetStore } from "./admin-users-sheet.store";

describe("useAdminUsersSheetStore", () => {
  beforeEach(() => {
    useAdminUsersSheetStore.setState({ isOpen: false });
  });

  it("starts closed and toggles with open / close", () => {
    expect(useAdminUsersSheetStore.getState().isOpen).toBe(false);
    useAdminUsersSheetStore.getState().open();
    expect(useAdminUsersSheetStore.getState().isOpen).toBe(true);
    useAdminUsersSheetStore.getState().close();
    expect(useAdminUsersSheetStore.getState().isOpen).toBe(false);
  });
});
