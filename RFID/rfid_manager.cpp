#include "rfid_manager.h"
#include "config.h"

#include <SPI.h>

MFRC522 rfid(SS_PIN,RST_PIN);

void initRFID()
{
    SPI.begin(SPI_SCK,SPI_MISO,SPI_MOSI,SS_PIN);

    rfid.PCD_Init();
}

bool readUID(String &uid)
{
    if(!rfid.PICC_IsNewCardPresent())
        return false;

    if(!rfid.PICC_ReadCardSerial())
        return false;

    uid="";

    for(byte i=0;i<rfid.uid.size;i++)
    {
        if(rfid.uid.uidByte[i]<0x10)
            uid+="0";

        uid+=String(rfid.uid.uidByte[i],HEX);
    }

    uid.toUpperCase();

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();

    return true;
}
