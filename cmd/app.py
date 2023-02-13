#! /usr/bin/env python
# __*__coding: UTF-8__*__
import  socket
import time
import os
import json
import getpass
target_host = "127.0.0.1"
target_port = 8000
client = None;
wallets = {}
print(os.path.abspath('cmd/.env'))
print(os.getcwd())
fileObj = open(os.path.abspath('cmd/.env'),'r')
try:
  addrList = fileObj.readlines()
  for key in addrList:
    address = key.strip('\n');
    print("********** Wallet Address:: %s **********\n" % address)
    if (wallets.__contains__(address) == False):
        wallets.setdefault(address, "");
    if wallets[address]=='':
        str = getpass.getpass(prompt='Inject Key ['+address+']:')
        wallets[address] = str;
finally:
    fileObj.close()
def tcp_conn():
    global client;
    try:
        client = socket.socket(socket.AF_INET,socket.SOCK_STREAM)
        client.connect((target_host,target_port))
        str_json = json.dumps(wallets)
        client.send(str_json.encode())
    except Exception as err:
        print(err)
tcp_conn()
while True:
    try: 
        time.sleep(10)
        str_json = json.dumps(wallets)
        client.send(str_json.encode())
    except Exception as err:
        tcp_conn()
        time.sleep(2)
        print(err)
