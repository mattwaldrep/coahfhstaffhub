import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { processSundayReviewVoice } from "@/lib/sunday-review-voice.functions";

type FieldKey =
  | "worship_notes"
  | "confession_notes"
  | "connect_notes"
  | "sermon_notes"
  | "wins"
  | "opportunities";

type CurrentForm = Record<FieldKey, string>;

interface Props {
  currentForm: CurrentForm;
  onMerge: (fields: CurrentForm) => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.readAsDataURL(blob);
  });
}

function pickMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

export function VoiceNoteRecorder({ currentForm, onMerge }: Props) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processVoice = useServerFn(processSundayReviewVoice);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleStart = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stopStream();
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 1000) {
          toast.error("Recording too short");
          return;
        }
        setProcessing(true);
        try {
          const audioBase64 = await blobToBase64(blob);
          const result = await processVoice({
            data: { audioBase64, mimeType, currentForm },
          });
          const merged: CurrentForm = { ...currentForm };
          (Object.keys(result.fields) as FieldKey[]).forEach((key) => {
            const incoming = result.fields[key]?.trim();
            if (!incoming) return;
            merged[key] = currentForm[key].trim()
              ? `${currentForm[key].trim()}\n\n${incoming}`
              : incoming;
          });
          onMerge(merged);
          const taskCount = result.createdTasks.length;
          toast.success(
            taskCount > 0
              ? `Notes added. Created ${taskCount} follow-up task${taskCount === 1 ? "" : "s"}.`
              : "Notes added to the form.",
          );
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Voice processing failed");
        } finally {
          setProcessing(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setElapsed(0);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
    } catch (err) {
      toast.error(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone permission denied"
          : "Couldn't start recording",
      );
      stopStream();
    }
  };

  const handleStop = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const mmss = `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}`;

  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="w-4 h-4 text-primary" />
          Voice note
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {recording
            ? `Recording… ${mmss}. Speak freely about the service.`
            : processing
              ? "Transcribing and sorting your feedback…"
              : "Tap record, share your thoughts. We'll fill in the form and create follow-up tasks."}
        </p>
      </div>
      {!recording && !processing && (
        <Button type="button" size="sm" onClick={handleStart} className="shrink-0">
          <Mic className="w-4 h-4 mr-2" />
          Record
        </Button>
      )}
      {recording && (
        <Button type="button" size="sm" variant="destructive" onClick={handleStop} className="shrink-0">
          <Square className="w-4 h-4 mr-2" />
          Stop
        </Button>
      )}
      {processing && (
        <Button type="button" size="sm" disabled className="shrink-0">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Processing
        </Button>
      )}
    </div>
  );
}
