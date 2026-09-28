#ifndef RFID_MANAGER_H
#define RFID_MANAGER_H

#include <MFRC522.h>

extern MFRC522 rfid;

void initRFID();

bool readUID(String &uid);

bool readBlock(byte block,String &text);

bool writeBlock(byte block,String text);

#endif