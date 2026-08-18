/*
 * Browser-facing wrapper for the AprilTag reference implementation.
 *
 * This file is intentionally small: AprilTag itself remains a separately
 * licensed third-party dependency (BSD-2-Clause). The build script pins the
 * revision used to produce the companion WASM asset.
 */

#include <math.h>
#include <stdint.h>
#include <stdlib.h>

#include "apriltag.h"
#include "apriltag_pose.h"
#include "common/image_u8.h"
#include "common/zarray.h"
#include "tag25h9.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

enum {
  RESULT_STRIDE = 16,
  MAX_RESULTS = 64,
};

// Result layout: id, hamming, decision margin, reprojection error,
// 3x3 rotation (row-major), and translation (x, y, z), all as f64.
static double g_results[MAX_RESULTS * RESULT_STRIDE];
static int g_result_count = 0;

static apriltag_family_t *g_family = NULL;
static apriltag_detector_t *g_detector = NULL;
static uint8_t *g_image = NULL;
static int g_width = 0;
static int g_height = 0;

EMSCRIPTEN_KEEPALIVE
int atag_init(void) {
  if (g_detector != NULL) return 0;

  g_family = tag25h9_create();
  g_detector = apriltag_detector_create();
  if (g_family == NULL || g_detector == NULL) return -1;

  apriltag_detector_add_family_bits(g_detector, g_family, 1);
  g_detector->quad_decimate = 1.5;
  g_detector->quad_sigma = 0.0;
  g_detector->nthreads = 1;
  g_detector->refine_edges = 1;
  g_detector->debug = 0;
  return 0;
}

EMSCRIPTEN_KEEPALIVE
void atag_destroy(void) {
  if (g_detector != NULL) {
    apriltag_detector_destroy(g_detector);
    g_detector = NULL;
  }
  if (g_family != NULL) {
    tag25h9_destroy(g_family);
    g_family = NULL;
  }
  free(g_image);
  g_image = NULL;
  g_width = 0;
  g_height = 0;
  g_result_count = 0;
}

EMSCRIPTEN_KEEPALIVE
uint8_t *atag_set_image_size(int width, int height) {
  if (width <= 0 || height <= 0) return NULL;
  if (width == g_width && height == g_height && g_image != NULL) {
    return g_image;
  }

  uint8_t *next = (uint8_t *)realloc(g_image, (size_t)width * height);
  if (next == NULL) return NULL;
  g_image = next;
  g_width = width;
  g_height = height;
  return g_image;
}

EMSCRIPTEN_KEEPALIVE
void atag_set_quad_decimate(double value) {
  if (g_detector != NULL && value >= 1.0 && value <= 4.0) {
    g_detector->quad_decimate = value;
  }
}

EMSCRIPTEN_KEEPALIVE
int atag_detect(double fx, double fy, double cx, double cy, double tag_size) {
  g_result_count = 0;
  if (g_detector == NULL || g_image == NULL ||
      !isfinite(fx) || !isfinite(fy) || !isfinite(cx) || !isfinite(cy) ||
      fx <= 0.0 || fy <= 0.0 || tag_size <= 0.0) {
    return 0;
  }

  image_u8_t image = {
      .width = g_width,
      .height = g_height,
      .stride = g_width,
      .buf = g_image,
  };
  zarray_t *detections = apriltag_detector_detect(g_detector, &image);
  const int count = zarray_size(detections);

  for (int i = 0; i < count && g_result_count < MAX_RESULTS; ++i) {
    apriltag_detection_t *detection;
    zarray_get(detections, i, &detection);

    apriltag_detection_info_t info = {
        .det = detection,
        .tagsize = tag_size,
        .fx = fx,
        .fy = fy,
        .cx = cx,
        .cy = cy,
    };
    apriltag_pose_t pose = {0};
    const double error = estimate_tag_pose(&info, &pose);
    if (pose.R == NULL || pose.t == NULL) {
      matd_destroy(pose.R);
      matd_destroy(pose.t);
      continue;
    }

    double *result = &g_results[g_result_count * RESULT_STRIDE];
    result[0] = detection->id;
    result[1] = detection->hamming;
    result[2] = detection->decision_margin;
    result[3] = error;
    for (int row = 0; row < 3; ++row) {
      for (int col = 0; col < 3; ++col) {
        result[4 + row * 3 + col] = matd_get(pose.R, row, col);
      }
    }
    result[13] = matd_get(pose.t, 0, 0);
    result[14] = matd_get(pose.t, 1, 0);
    result[15] = matd_get(pose.t, 2, 0);
    ++g_result_count;

    matd_destroy(pose.R);
    matd_destroy(pose.t);
  }

  apriltag_detections_destroy(detections);
  return g_result_count;
}

EMSCRIPTEN_KEEPALIVE
int atag_result_stride(void) {
  return RESULT_STRIDE;
}

EMSCRIPTEN_KEEPALIVE
double *atag_results_ptr(void) {
  return g_results;
}
