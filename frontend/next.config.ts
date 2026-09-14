import type { NextConfig } from "next";
import os from "node:os";

// const nextConfig: NextConfig = {

//     allowedDevOrigins: [
//         "192.168.1.150",
//         "192.168.1.150:5001",
//         "192.168.1.150:3006",
//         "192.168.1.174",
//         "192.168.1.174:3006",
//         "192.168.1.174:5006",
//         "192.168.1.253",
//         "192.168.1.253:3006",
//         "192.168.1.253:5006",
//         "192.168.1.251",
//         "192.168.1.251:3006",
//         "192.168.1.251:5006",
//         "https://serviamusmedicalclinic.org",
//     ]

// };

// development auto detect local network IPs and add them to allowedDevOrigins

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }

  return ips;
}

const localIPs = getLocalIPs();

console.log("\n========================================");
console.log("🌐 Local Network IPs:");
localIPs.forEach((ip) => {
  console.log(`   http://${ip}:3006`);
  console.log(`   http://${ip}:5006`);
});
console.log("========================================\n");

const allowedDevOrigins = [
  ...localIPs,
  ...localIPs.flatMap((ip) => [`${ip}:3006`, `${ip}:5006`]),
  // "https://serviamusmedicalclinic.org",
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

// module.exports = nextConfig;

// const allowedDevOrigins = [
//     ...Array.from({ length: 254 }, (_, i) => `192.168.1.${i + 1}`),
//     "https://serviamusmedicalclinic.org",
// ];

export default nextConfig;
