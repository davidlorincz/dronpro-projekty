"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPicker } from "@/components/shared/UserPicker";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@/lib/constants";
import { errorToast } from "@/lib/convexError";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./ChatContext";

const inputCls = "w-full rounded-lg border border-a-border bg-a-input px-3 py-2 text-sm text-a-text outline-none focus:border-cyan-500 placeholder:text-a-text-4";

/** Ze zprávy rovnou subúkol — a do vlákna odkaz na projekt, ať se to neztratí. */
export function SubtaskFromMessageDialog({ message, plainText, onClose }: {
  message: ChatMessage; plainText: string; onClose: () => void;
}) {
  const projects = useQuery(api.projects.options);
  const create = useMutation(api.subtasks.create);
  const send = useMutation(api.chatMessages.send);
  const [projectId, setProjectId] = useState<string>("");
  const [title, setTitle] = useState(plainText.split("\n")[0].slice(0, 120));
  const [assigneeIds, setAssigneeIds] = useState<Id<"users">[]>([]);
  const [priority, setPriority] = useState<Priority>("middle");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!projectId || !title.trim() || saving) return;
    setSaving(true);
    try {
      await create({
        projectId: projectId as Id<"projects">,
        title: title.trim(),
        assigneeIds,
        priority,
        deadline: deadline || undefined,
        description: plainText.slice(0, 2000),
      });
      await send({
        channelId: message.channelId,
        parentId: message.parentId ?? message._id,
        text: `Založen subúkol „${title.trim()}“ ${window.location.origin}/projekty/${projectId}`,
      });
      toast("Subúkol založen", "success");
      onClose();
    } catch (e) { errorToast(e); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="overflow-visible">
        <DialogHeader>
          <DialogTitle>Založit subúkol ze zprávy</DialogTitle>
          <DialogDescription>Text zprávy se uloží do popisu a do vlákna přijde odkaz na projekt.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-a-text-2">Projekt</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={cn(inputCls, "cursor-pointer")}>
              <option value="">Vyber projekt…</option>
              {(projects ?? []).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-a-text-2">Název</label>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-a-text-2">Priorita</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={cn(inputCls, "cursor-pointer")}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-a-text-2">Deadline</label>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={cn(inputCls, "cursor-pointer")} />
            </div>
            <div className="pb-1">
              <label className="mb-1 block text-sm font-medium text-a-text-2">Odpovědní</label>
              <UserPicker value={assigneeIds} onChange={setAssigneeIds} placeholder="Přiřadit" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Zrušit</Button>
          <Button onClick={() => void submit()} disabled={!projectId || !title.trim() || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Založit subúkol
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
