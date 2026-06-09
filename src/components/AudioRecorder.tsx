/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";
import { Mic, Square, Trash2, CheckCircle2, Loader2, Play, Pause } from "lucide-react";

interface AudioRecorderProps {
  onRecordingComplete: (base64Data: string, mimeType: string, durationSec: number) => void;
}

export function AudioRecorder({ onRecordingComplete }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [recordedBlobDetail, setRecordedBlobDetail] = useState<{
    base64: string;
    mimeType: string;
  } | null>(null);
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 錄音秒數計時器
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // 播放結束監聽
  useEffect(() => {
    const handlePlaybackEnded = () => {
      setIsPlaying(false);
    };
    if (audioRef.current) {
      audioRef.current.addEventListener("ended", handlePlaybackEnded);
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener("ended", handlePlaybackEnded);
      }
    };
  }, [audioUrl]);

  // 格式化時間 (e.g. 02:14)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // 開始錄音
  const startRecording = async () => {
    try {
      setErrorMsg(null);
      audioChunksRef.current = [];
      setAudioUrl(null);
      setRecordedBlobDetail(null);
      setRecordingTime(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // 選擇 sandbox 支援最廣泛且合適的 mimeType
      let preferredMimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported(preferredMimeType)) {
        preferredMimeType = "audio/mp4";
      }
      if (!MediaRecorder.isTypeSupported(preferredMimeType)) {
        preferredMimeType = ""; // 瀏覽器預設
      }

      const options = preferredMimeType ? { mimeType: preferredMimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorder.mimeType || "audio/webm" 
        });
        
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);

        // 轉換為 Base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64String = reader.result as string;
          // 淨化 base64Data
          const pureBase64 = base64String.split(",")[1];
          const actualMimeType = audioBlob.type;
          
          setRecordedBlobDetail({
            base64: pureBase64,
            mimeType: actualMimeType
          });
        };

        // 關閉麥克風串流
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200); // 200ms slice
      setIsRecording(true);
    } catch (err) {
      console.error("無法存取麥克風設備：", err);
      setErrorMsg("存取麥克風設備失敗，請確定您已在瀏覽器設定中允許此網站的麥克風存取權限。");
    }
  };

  // 停止錄音
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // 清除錄音
  const resetRecorder = () => {
    setErrorMsg(null);
    setIsRecording(false);
    setAudioUrl(null);
    setRecordedBlobDetail(null);
    setRecordingTime(0);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  // 播放與暫停控制
  const togglePlay = () => {
    if (!audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.addEventListener("ended", () => setIsPlaying(false));
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // 確認並提交錄製好的音訊
  const submitRecording = () => {
    if (recordedBlobDetail) {
      onRecordingComplete(
        recordedBlobDetail.base64,
        recordedBlobDetail.mimeType,
        recordingTime || 1
      );
    }
  };

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900/40 p-5 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 text-center" id="audio-recorder">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">語音現場錄製</span>
        </div>
        <span className="text-xs font-mono font-bold bg-zinc-200/60 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-700 dark:text-zinc-300">
          {formatTime(recordingTime)}
        </span>
      </div>

      {!audioUrl ? (
        <div className="py-6 flex flex-col items-center justify-center">
          {isRecording ? (
            <div className="space-y-4">
              {/* 美麗模擬錄音波形線 */}
              <div className="flex justify-center items-center gap-1 h-8 px-4">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                  <span
                    key={num}
                    style={{
                      height: `${Math.floor(Math.random() * 40) + 10}%`,
                      animationDelay: `${num * 0.08}s`
                    }}
                    className="w-1 bg-red-500 rounded-full animate-[wave_1.1s_ease-in-out_infinite]"
                  ></span>
                ))}
              </div>
              <p className="text-xs text-red-500 font-medium tracking-wide">正在錄製麥克風音訊中...</p>
              
              <button
                onClick={stopRecording}
                className="mx-auto flex items-center gap-2 px-5 py-3 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 active:scale-95 transition-all text-sm font-semibold cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>停止錄音</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xs mx-auto">
                點擊下方按鈕以開始錄音，你可以直接錄製會議、教學說明、隨手札記、AI 互動靈感。
              </p>
              <button
                onClick={startRecording}
                className="mx-auto flex items-center gap-2.5 px-6 py-3.5 rounded-full bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 shadow-md active:scale-95 transition-all text-sm font-semibold cursor-pointer"
              >
                <Mic className="w-4 h-4 text-red-500 shrink-0" />
                <span>開啟麥克風並錄音</span>
              </button>

              {errorMsg && (
                <p className="text-xs text-red-500 font-medium max-w-sm mx-auto bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl mt-2 animate-pulse">
                  ⚠️ {errorMsg}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="py-2 space-y-4">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 p-3 rounded-xl flex items-center justify-between shadow-sm">
            <button
              onClick={togglePlay}
              className="p-3.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 hover:scale-105 active:scale-95 transition-all shrink-0"
              title={isPlaying ? "暫停" : "播放"}
            >
              {isPlaying ? <Pause className="w-4 h-4 text-indigo-600" /> : <Play className="w-4 h-4 text-indigo-600 fill-current" />}
            </button>
            <div className="flex-1 text-left px-4">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                錄音已就緒
              </p>
              <p className="text-xs text-zinc-400 font-mono">
                時長: {formatTime(recordingTime)} • Mime: audio/webm
              </p>
            </div>
            
            <button
              onClick={resetRecorder}
              className="p-2.5 rounded-lg text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="捨棄並重新錄音"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={resetRecorder}
              className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 text-xs font-semibold active:scale-[0.98] transition-all"
            >
              重新錄製
            </button>
            <button
              onClick={submitRecording}
              disabled={!recordedBlobDetail}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-200 text-white dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600 text-xs font-semibold shadow shadow-emerald-600/15 active:scale-[0.98] transition-all cursor-pointer"
            >
              {!recordedBlobDetail ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>確認送出整理</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
