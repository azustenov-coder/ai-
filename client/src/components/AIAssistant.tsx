import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, X, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { VoiceAssistant } from "@/lib/voiceAssistant";
import { WEBSITE_INFO } from "@/lib/ai-context";

class CommandQueue {
  private queue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  add(task: () => Promise<void>) {
    this.queue.push(task);
    if (!this.isProcessing) {
      this.process();
    }
  }

  private async process() {
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
      }
    }
    this.isProcessing = false;
  }
}

const commandQueue = new CommandQueue();

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [, setLocation] = useLocation();
  const assistantRef = useRef<VoiceAssistant | null>(null);

  useEffect(() => {
// ... existing AIAssistant effect code starts at line 17 but wait, I must replace exactly from line 8
// Let's broaden the replace target to encompass `handleCommand` correctly.
    try {
      console.log("AIAssistant Mounting - API Key Check:", !!(import.meta as any).env.VITE_GEMINI_API_KEY);
      assistantRef.current = new VoiceAssistant();
    } catch (err) {
      console.error("AIAssistant Effect Error:", err);
    }

    // Wake Word Listener Initialization
    let recognition: any = null;
    let isListeningForWakeWord = false;

    const startWakeWordListener = () => {
      // @ts-ignore
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.warn("Speech recognition not supported in this browser. Wake word won't work.");
        return;
      }

      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'uz-UZ';

      recognition.onstart = () => {
        isListeningForWakeWord = true;
        console.log("Wake word listener started.");
      };

      recognition.onresult = (event: any) => {
        // If Gemini is already active or connecting, we ignore the wake word listener
        if (isActiveRef.current || isConnectingRef.current) return;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const transcript = event.results[i][0].transcript.toLowerCase();
            console.log("Wake word check:", transcript);
            
            // Checking common variations of "Saydx"
            if (
              transcript.includes('sayd') || 
              transcript.includes('said') || 
              transcript.includes('sayt') || 
              transcript.includes('say x')
            ) {
              console.log("🔥 Wake word detected! Starting Assistant...");
              startAssistant();
              recognition.stop();
              break;
            }
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.error("Wake Word Listener Error:", event.error);
        }
      };

      recognition.onend = () => {
        isListeningForWakeWord = false;
        // Auto restart if AI is not active and not connecting
        if (!isActiveRef.current && !isConnectingRef.current) {
          setTimeout(() => {
            try {
              recognition.start();
            } catch (e) {}
          }, 1000);
        }
      };

      try {
        recognition.start();
      } catch (e) {
        console.error("Could not start wake word recognition:", e);
      }
    };

    // Delay start slightly to ensure component is fully mounted
    setTimeout(startWakeWordListener, 1000);

    return () => {
      assistantRef.current?.stop();
      if (recognition) {
        recognition.onend = null;
        recognition.stop();
      }
    };
  }, []);

  const handleCommand = (command: string) => {
    console.log("Raw Command:", command);
    
    // Format: [CMD: TYPE, VALUE]
    const cmdMatch = command.match(/\[CMD: (\w+), ([^\]]+)\]/);
    if (cmdMatch) {
      const type = cmdMatch[1].toUpperCase();
      const value = cmdMatch[2].trim();
      
      commandQueue.add(async () => {
        console.log(`AI ACTION EXECUTING: ${type} -> ${value}`);
        switch (type) {
          case "NAVIGATE":
            setLocation(value);
            // Wait for route transition to render
            await new Promise(r => setTimeout(r, 800));
            break;
            
          case "SCROLL":
            // Slight delay before scrolling to guarantee component is mounted
            await new Promise(r => setTimeout(r, 200));
            let el = document.querySelector(value);
            if (!el) {
               // Retry once if not found
               await new Promise(r => setTimeout(r, 500));
               el = document.querySelector(value);
            }
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            await new Promise(r => setTimeout(r, 500));
            break;
            
          case "SELECT_TEAM":
            window.dispatchEvent(new CustomEvent("ai-select-team", { detail: value }));
            await new Promise(r => setTimeout(r, 800));
            break;
            
          case "UI_EVENT":
            window.dispatchEvent(new CustomEvent("ai-ui-event", { detail: value }));
            await new Promise(r => setTimeout(r, 800));
            break;
            
          case "OPEN_SERVICE":
            window.dispatchEvent(new CustomEvent("ai-open-service", { detail: value }));
            await new Promise(r => setTimeout(r, 800));
            break;
            
          case "PORTFOLIO_TAB":
            window.dispatchEvent(new CustomEvent("ai-portfolio-tab", { detail: value }));
            await new Promise(r => setTimeout(r, 500));
            break;
            
          case "HELP_ACTION":
            window.dispatchEvent(new CustomEvent("ai-help-action", { detail: value }));
            await new Promise(r => setTimeout(r, 500));
            break;
        }
      });
      return;
    }

    // Fallback for legacy [NAVIGATE: /path]
    const navMatch = command.match(/\[NAVIGATE: ([^\]]+)\]/);
    if (navMatch) {
      commandQueue.add(async () => {
        setLocation(navMatch[1].trim());
        await new Promise(r => setTimeout(r, 800));
      });
    }
  };

  const [isConnecting, setIsConnecting] = useState(false);
  const isActiveRef = useRef(false);
  const isConnectingRef = useRef(false);

  const startAssistant = async () => {
    if (isConnectingRef.current) {
      console.log("Already connecting, skipping...");
      return;
    }
    
    setIsConnecting(true);
    isConnectingRef.current = true;
    setStatus("Connecting...");
    
    let accumulatedText = "";
    let lastProcessedIndex = 0;
    
    try {
      await assistantRef.current?.start(
        WEBSITE_INFO,
        (text) => {
          accumulatedText += text;
          const searchSpace = accumulatedText.substring(lastProcessedIndex);
          const allCommandMatches = searchSpace.match(/\[(CMD|NAVIGATE): [^\]]+\]/g);
          
          if (allCommandMatches) {
            allCommandMatches.forEach(cmd => {
              handleCommand(cmd);
              // Advance the index so we don't process the same substring again
              const foundAt = searchSpace.indexOf(cmd);
              if (foundAt !== -1) {
                lastProcessedIndex += foundAt + cmd.length;
              }
            });
          }
        },
        (s) => {
          console.log("AIAssistant Status Update:", s);
          setStatus(s);
          
          if (s === "Connected") {
            setIsConnecting(false);
            isConnectingRef.current = false;
            setIsActive(true);
            isActiveRef.current = true;
          }

          if ((s === "Disconnected" || s === "Error")) {
            const wasActive = isActiveRef.current;
            setIsConnecting(false);
            isConnectingRef.current = false;
            
            if (wasActive) {
              console.log("Connection dropped. Auto-reconnecting in 1.5s...");
              setTimeout(() => {
                if (isActiveRef.current) startAssistant();
              }, 1500);
            }
          }
        }
      );
    } catch (err) {
      console.error("AI Start Error:", err);
      setStatus("Error");
      setIsConnecting(false);
      isConnectingRef.current = false;
    }
  };

  const toggleAssistant = async () => {
    if (isConnecting) {
      console.log("Toggle ignored while connecting");
      return;
    }

    if (isActive) {
      isActiveRef.current = false;
      assistantRef.current?.stop();
      setIsActive(false);
      setStatus("Stopped");
    } else {
      await startAssistant();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center pointer-events-none">
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            className="mb-4 px-4 py-2 bg-zinc-900/80 backdrop-blur-md border border-white/5 rounded-2xl shadow-xl pointer-events-auto"
          >
            <span className="text-[10px] font-bold tracking-widest text-orange-500 uppercase animate-pulse">
              {status === "Connected" ? "Listening..." : status}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative cursor-pointer group pointer-events-auto" onClick={toggleAssistant}>
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0.1, 0.2, 0.1], scale: [1, 1.2, 1] }}
              exit={{ opacity: 0 }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="absolute inset-0 bg-orange-600 rounded-full blur-3xl -z-10"
            />
          )}
        </AnimatePresence>

        <motion.div
          animate={isActive ? {
            y: [0, -10, 0],
            scale: [1, 1.05, 1],
            rotate: [0, 2, -2, 0]
          } : {
            y: [0, -5, 0]
          }}
          transition={{
            repeat: Infinity,
            duration: isActive ? 2 : 4,
            ease: "easeInOut"
          }}
          whileHover={{ scale: 1.1 }}
          className="relative w-28 h-28 md:w-36 md:h-36 flex items-center justify-center overflow-hidden"
        >
          <img 
            src="/robot.png" 
            alt="SAYD.X AI" 
            className={`w-full h-full object-contain transition-all duration-500 scale-125 ${!isActive ? "grayscale-[0.5] opacity-70" : "drop-shadow-[0_0_20px_rgba(234,88,12,0.4)]"}`}
            style={{
              WebkitMaskImage: 'radial-gradient(circle, black 65%, transparent 100%)',
              maskImage: 'radial-gradient(circle, black 65%, transparent 100%)',
            }}
          />

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-2">
            <motion.span 
              animate={isActive ? { opacity: [0.6, 1, 0.6], scale: [1, 1.05, 1] } : { opacity: 0.3 }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-white font-black text-xl md:text-2xl tracking-tighter"
              style={{ 
                fontFamily: 'sans-serif', 
                textShadow: '0 0 10px rgba(234,88,12,0.8), 0 0 20px rgba(255,255,255,0.4)' 
              }}
            >
              X
            </motion.span>
          </div>
          
          <div className="absolute top-[25%] right-[25%] z-20">
             <div className={`w-3.5 h-3.5 rounded-full border-2 border-zinc-950/50 ${isActive ? "bg-green-500 shadow-[0_0_12px_#22c55e]" : "bg-zinc-700"}`} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
