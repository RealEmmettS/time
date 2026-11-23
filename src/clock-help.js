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
      "Open Settings → Time & language → Date & time and enable Set time automatically.",
      "Under Additional settings, select Sync now. Wait for Windows to confirm the sync, then return here and select Check again.",
    ],
    services: [
      {
        title: "Choose a different Windows time server",
        text: "If you need to change the configured server, open Control Panel → Clock and Region → Date and Time → Internet Time → Change settings. Enable synchronization, enter time.cloudflare.com, select Update now, and confirm success before selecting OK. A work-managed PC may use an organization-controlled time source.",
      },
    ],
    links: [
      [
        "Windows synchronization settings",
        "https://support.microsoft.com/en-us/windows/experience/personalization/set-time-date-and-time-zone-settings-in-windows",
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
      "Allow automatic synchronization to settle, then return here and select Check again.",
    ],
    services: [
      {
        title: "Choose a different Mac time server",
        text: "Select Set beside the automatic time source. To use Cloudflare, enter time.cloudflare.com, authenticate if asked, and confirm the change.",
      },
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
  document.defaultView?.ShaughvDropdown?.enhance(select)?.refresh();
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
      if (service.code) add("pre", service.code, detail);
    }
    for (const [label, url] of help.links) {
      const link = add("a", label);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    add(
      "p",
      "This comparison uses UTC. If the clock check looks good but the displayed hour is wrong, check your device’s time zone.",
    );
  };
  select.addEventListener("change", render);
  render();
}
