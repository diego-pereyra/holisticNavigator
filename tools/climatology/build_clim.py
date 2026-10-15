#!/usr/bin/env python3
import os
import json
import struct
import time
from pathlib import Path
from datetime import datetime
import numpy as np

RAW = Path("data/clim/raw")
OUT = Path("data/clim")
WEB = Path("web/public/clim")
RAW.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
WEB.mkdir(parents=True, exist_ok=True)

LATS = 180
LONS = 360
CELLS = LATS * LONS
FIELDS = ["wu", "wv", "ws", "st", "hs", "cu", "cv", "tc", "ice"]
