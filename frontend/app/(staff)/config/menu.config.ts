// Kept as a compatibility import for existing staff pages. The authoritative
// SERVIAMUS-style navigation configuration lives in app/(admin)/config.
export {
  MENU_ITEMS as STAFF_MENU_ITEMS,
  canAccessMenuItem,
  departmentLabel,
  menuItemForPath,
} from "@/app/(admin)/config/menu.config";
