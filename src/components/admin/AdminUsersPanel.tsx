import { UserCog } from "lucide-react";
import { Card } from "../ui";
import StaffManagementPanel from "./StaffManagementPanel";

export default function AdminUsersPanel() {
  return (
    <Card>
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-ink">
        <UserCog size={18} className="text-brand-600" />
        Usuarios y empleados
      </h3>
      <StaffManagementPanel />
    </Card>
  );
}
