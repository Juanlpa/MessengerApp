import React from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { CallState } from '@/hooks/useWebRTC';

interface CallModalProps {
  callState: CallState;
  otherUsername: string;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  onAccept: () => void;
  onReject: () => void;
  onEndCall: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
}

export function CallModal({
  callState,
  otherUsername,
  localVideoRef,
  remoteVideoRef,
  onAccept,
  onReject,
  onEndCall,
  onToggleAudio,
  onToggleVideo,
  isAudioMuted,
  isVideoMuted,
}: CallModalProps) {
  if (callState === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl max-h-[90vh] aspect-video bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-800">
        
        {/* Remote Video (Background) */}
        {(callState === 'connected' || callState === 'calling') && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        )}

        {/* Local Video (PiP) */}
        {(callState === 'connected' || callState === 'calling') && (
          <div className="absolute bottom-6 right-6 w-48 aspect-video bg-gray-800 rounded-lg overflow-hidden shadow-lg border border-gray-700">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted // Local video MUST be muted to prevent feedback loop
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Overlays */}
        <div className="absolute inset-0 flex flex-col justify-between p-6">
          
          {/* Header */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white drop-shadow-md">
              {otherUsername}
            </h2>
            <p className="text-gray-300 drop-shadow-md">
              {callState === 'calling' && 'Llamando...'}
              {callState === 'receiving' && 'Llamada entrante...'}
              {callState === 'connected' && 'Llamada cifrada P2P'}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center space-x-6">
            
            {callState === 'receiving' && (
              <>
                <button
                  onClick={onAccept}
                  className="p-4 bg-green-500 hover:bg-green-600 text-white rounded-full transition-colors shadow-lg"
                >
                  <Phone className="w-8 h-8" />
                </button>
                <button
                  onClick={onReject}
                  className="p-4 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-lg"
                >
                  <PhoneOff className="w-8 h-8" />
                </button>
              </>
            )}

            {(callState === 'calling' || callState === 'connected') && (
              <>
                <button
                  onClick={onToggleAudio}
                  className={`p-4 rounded-full transition-colors shadow-lg ${
                    isAudioMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                  } text-white`}
                >
                  {isAudioMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                
                <button
                  onClick={onEndCall}
                  className="p-4 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-lg"
                >
                  <PhoneOff className="w-8 h-8" />
                </button>

                <button
                  onClick={onToggleVideo}
                  className={`p-4 rounded-full transition-colors shadow-lg ${
                    isVideoMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                  } text-white`}
                >
                  {isVideoMuted ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                </button>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
