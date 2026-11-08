cmake_minimum_required(VERSION 3.10)
project(SentinelVision_AI_Monitoring VERSION 2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(include)

# Optional OpenCV support
find_package(OpenCV QUIET)
if(OpenCV_FOUND)
    message(STATUS "OpenCV found: ${OpenCV_VERSION}")
    include_directories(${OpenCV_INCLUDE_DIRS})
    add_definitions(-DENABLE_OPENCV_CPP)
else()
    message(STATUS "OpenCV not found. Building with standalone Windows vision pipeline.")
endif()

set(SOURCES
    src/main.cpp
)

add_executable(monitor_cpp ${SOURCES})

target_link_libraries(monitor_cpp
    ws2_32
    winmm
    shell32
)

if(OpenCV_FOUND)
    target_link_libraries(monitor_cpp ${OpenCV_LIBS})
endif()
