#!/bin/sh
set -eu
c++ -O3 -std=c++17 -Wall -Wextra -pedantic main.cpp -o claim14_review
./claim14_review
