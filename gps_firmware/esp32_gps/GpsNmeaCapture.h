#pragma once
#include <cstddef>
#include <cstring>

// Preserve receiver evidence before parsing/smoothing, including its checksum.
struct GpsNmeaCapture {
  char line[128]{},rmc[128]{},gga[128]{};
  std::size_t used=0;
  bool overflow=false;
  void push(char c) {
    if (c=='$') { used=0; overflow=false; }
    if (c=='\r') return;
    if (c=='\n') {
      if (!overflow && used>=6 && line[0]=='$') {
        line[used]=0;
        if (!std::strncmp(line+3,"RMC",3)) std::strcpy(rmc,line);
        if (!std::strncmp(line+3,"GGA",3)) std::strcpy(gga,line);
      }
      used=0; overflow=false; return;
    }
    if (used<sizeof(line)-1) line[used++]=c;
    else overflow=true;
  }
};
