// Copyright QubeTX — tikset.com

export function detectPlatform(nav = {}) {
  const ua = nav.userAgent || "";
  const platform = nav.userAgentData?.platform || nav.platform || "";
  if (
    /iPhone|iPad|iPod/i.test(ua) ||
    (/Mac/i.test(platform) && nav.maxTouchPoints > 1)
  )
    return "mobile";
  if (/Android/i.test(ua) || nav.userAgentData?.mobile) return "mobile";
  if (/Windows|Win32|Win64/i.test(platform + " " + ua)) return "windows";
  if (/Mac/i.test(platform + " " + ua)) return "macos";
  if (/CrOS/i.test(ua)) return "unknown";
  if (/Linux/i.test(platform + " " + ua)) return "linux";
  return "unknown";
}

export const CLOCK_HELP = {
  windows: {
    title: "Windows",
    steps: [
      "Open Settings → Time & language → Date & time. Enable Set time automatically, then select Sync now. You can keep time.windows.com if synchronization succeeds.",
      "To choose Cloudflare instead, open Control Panel → Clock and Region → Date and Time → Internet Time → Change settings.",
      "Enable Synchronize with an Internet time server. Enter time.cloudflare.com, select Update now, wait for the success message, then select OK.",
      "Return here and select Check again. If Internet Time is unavailable on a work-managed PC, its time source may be controlled by your organization.",
    ],
    links: [
      [
        "Windows synchronization settings",
        "https://learn.microsoft.com/en-us/windows-server/networking/windows-time-service/windows-time-service-tools-and-settings",
      ],
      [
        "Cloudflare setup guide",
        "https://developers.cloudflare.com/time-services/ntp/usage/",
      ],
    ],
  },
  macos: {
    title: "macOS",
    steps: [
      "Open System Settings → General → Date & Time. Turn on Set time and date automatically (the wording varies slightly by macOS version).",
      "To choose Cloudflare, select Set beside Source, authenticate if asked, and enter time.cloudflare.com. Confirm the change. Keeping Apple’s default server is also reasonable if it synchronizes successfully.",
      "Allow synchronization to settle, then return here and select Check again. A restart is not normally required just to change the time server.",
    ],
    links: [
      [
        "Apple date and time guide",
        "https://support.apple.com/guide/mac-help/mchlp2996/mac",
      ],
      [
        "Cloudflare setup guide",
        "https://developers.cloudflare.com/time-services/ntp/usage/",
      ],
    ],
  },
  linux: {
    title: "Linux",
    steps: [
      "Enable Automatic Date & Time in your desktop settings first. Linux distributions use different synchronization services; a browser cannot detect which service is running.",
      "Check your distribution’s documentation or run the read-only commands below. Configure the service already in use; do not enable a competing time service.",
    ],
    code: "timedatectl status\nsystemctl is-active systemd-timesyncd chronyd chrony",
    services: [
      {
        title: "If systemd-timesyncd is active",
        text: "Edit the existing [Time] section of /etc/systemd/timesyncd.conf with administrator privileges and set NTP=time.cloudflare.com. Restart the service, then confirm the selected Server and synchronization status. Network-provided or distribution overrides can affect the selected source.",
        code: "sudo systemctl restart systemd-timesyncd\ntimedatectl timesync-status",
      },
      {
        title: "If chrony / chronyd is active",
        text: "In your distribution’s chrony configuration (often /etc/chrony/chrony.conf or /etc/chrony.conf), add the server line below. Keep unrelated settings. Cloudflare does not smear leap seconds, so avoid combining it with leap-smearing sources. Restart the active service: sudo systemctl restart chrony on systems using chrony.service, or sudo systemctl restart chronyd on systems using chronyd.service. Then inspect the selected source (*).",
        code: "server time.cloudflare.com iburst\n\n# After restarting the service:\nchronyc sources -v\nchronyc tracking",
      },
    ],
    links: [
      [
        "Cloudflare Linux configuration",
        "https://developers.cloudflare.com/time-services/ntp/usage/#linux",
      ],
      ["chrony documentation", "https://chrony-project.org/documentation.html"],
    ],
  },
  mobile: {
    title: "Mobile device",
    steps: [
      "Enable automatic date and time in your device settings. iOS and most Android settings do not offer a custom NTP server field. Return here and select Check again.",
      "If you are viewing instructions for a different computer, select its operating system above.",
    ],
    links: [],
  },
  unknown: {
    title: "Choose your operating system",
    steps: [
      "We could not reliably identify this operating system. Select Windows, macOS, or Linux above to see the relevant instructions.",
    ],
    links: [],
  },
};

export function mountClockHelp(document, nav) {
  const select = document.getElementById("clock-help-platform");
  const content = document.getElementById("clock-help-content");
  if (!select || !content) return;
  select.value = detectPlatform(nav);
  const render = () => {
    const help = CLOCK_HELP[select.value] || CLOCK_HELP.unknown;
    content.replaceChildren();
    const add = (tag, text, parent = content) => {
      const node = document.createElement(tag);
      node.textContent = text;
      parent.append(node);
      return node;
    };
    add("h3", help.title);
    const list = add("ol", "");
    help.steps.forEach((step) => add("li", step, list));
    if (help.code) add("pre", help.code);
    for (const service of help.services || []) {
      const detail = add("details", "");
      add("summary", service.title, detail);
      add("p", service.text, detail);
      add("pre", service.code, detail);
    }
    for (const [label, url] of help.links) {
      const link = add("a", label);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    add(
      "p",
      "After synchronization finishes, use Check again above. A different server does not guarantee better accuracy; successful, regular synchronization matters.",
    );
  };
  select.addEventListener("change", render);
  render();
}
