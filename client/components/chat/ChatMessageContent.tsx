"use client";

import "./ChatShared.css";
import { extractUrls, getMediaKind, getDomain, truncate, parseReplyBody } from "@/lib/chat/chatShared";

type ChatMessageContentProps = {
  text: string;
};

export default function ChatMessageContent({ text }: ChatMessageContentProps) {
  if (!text) return null;

  const parsed = parseReplyBody(text);
  if (parsed) {
    return (
      <>
        <div className="chatReplyQuoteBox">
          <span className="chatReplyQuoteSender">↳ {parsed.senderLabel}</span>
          <span className="chatReplyQuoteSnippet">{parsed.snippet}</span>
        </div>
        <MessageBody text={parsed.rest} />
      </>
    );
  }

  return <MessageBody text={text} />;
}

function MessageBody({ text }: { text: string }) {
  if (!text) return null;

  const urls = extractUrls(text).slice(0, 4);
  const parts = splitByUrls(text, urls);

  return (
    <div className="chatMessageBody">
      {parts.some((p) => p.value) && (
        <p className="chatMessageText">
          {parts.map((part, i) =>
            part.isUrl ? (
              <a key={i} href={part.value} target="_blank" rel="noopener noreferrer" className="chatInlineLink">
                {part.value}
              </a>
            ) : (
              <span key={i}>{part.value}</span>
            )
          )}
        </p>
      )}

      {urls.map((url) => {
        const kind = getMediaKind(url);
        if (kind === "image") {
          return (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="chatLinkMediaWrap">
              <img src={url} alt="" className="chatLinkMediaImg" loading="lazy" />
            </a>
          );
        }
        if (kind === "video") {
          return <video key={url} src={url} controls className="chatLinkMediaImg" />;
        }
        if (kind === "audio") {
          return <audio key={url} src={url} controls className="chatLinkMediaAudio" />;
        }
        return <LinkEmbedChip key={url} url={url} />;
      })}
    </div>
  );
}

function LinkEmbedChip({ url }: { url: string }) {
  const domain = getDomain(url);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="chatLinkEmbedChip">
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
        alt=""
        className="chatLinkEmbedFavicon"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      <div className="chatLinkEmbedInfo">
        <span className="chatLinkEmbedDomain">{domain}</span>
        <span className="chatLinkEmbedUrl">{truncate(url, 60)}</span>
      </div>
    </a>
  );
}

function splitByUrls(text: string, urls: string[]) {
  if (urls.length === 0) return [{ value: text, isUrl: false }];
  const parts: { value: string; isUrl: boolean }[] = [];
  let remaining = text;
  for (const url of urls) {
    const idx = remaining.indexOf(url);
    if (idx === -1) continue;
    if (idx > 0) parts.push({ value: remaining.slice(0, idx), isUrl: false });
    parts.push({ value: url, isUrl: true });
    remaining = remaining.slice(idx + url.length);
  }
  if (remaining) parts.push({ value: remaining, isUrl: false });
  return parts;
}
