import { ProjectForm } from "@/components/projects/ProjectForm";
import { RoleGate } from "@/components/layout/RoleGate";

export default function NewProjectPage() {
  return (
    <div className="max-w-4xl space-y-4">
      <div><h1 className="text-2xl">Nový projekt</h1><p className="text-sm text-a-text-3">Subúkoly přidáš hned po založení v detailu projektu.</p></div>
      <div className="card p-6"><RoleGate need="createProject"><ProjectForm /></RoleGate></div>
    </div>
  );
}
