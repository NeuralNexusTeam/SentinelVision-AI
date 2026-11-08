cmake_minimum_required(VERSION 3.10)
project(SentinelVision_AI VERSION 2.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(include)

# Optional OpenCV integration
find_package(OpenCV QUIET)
if(OpenCV_FOUND)
    message(STATUS "OpenCV found: ${OpenCV_VERSION}")
    include_directories(${OpenCV_INCLUDE_DIRS})
    add_definitions(-DENABLE_OPENCV_CPP)
endif()

add_executable(sentinel_vision
    src/main.cpp
)

target_link_libraries(sentinel_vision
    ws2_32
    winmm
    shell32
)

if(OpenCV_FOUND)
    target_link_libraries(sentinel_vision ${OpenCV_LIBS})
endif()
