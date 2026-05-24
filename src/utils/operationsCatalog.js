export const operationsCatalog = {
  "metadata": {
    "title": "Tenstorrent TT-Metal Eltwise Operations Catalog",
    "description": "Comprehensive list of all TT-Metal element-wise operations for performance tracking",
    "total_categories": 6,
    "total_operations": 288,
    "inplace_operations_included": 24,
    "test_coverage": "262/288 operations (91.0%)"
  },
  "priority_classification": {
    "high_priority": {
      "description": "Critical operations for daily monitoring",
      "count": 23,
      "operations": [
        "add", "subtract", "multiply", "divide", "sqrt", "exp", "log", "reciprocal",
        "relu", "gelu", "sigmoid", "tanh", "silu", "celu", "gt", "lt", "eq", "ne", 
        "ge", "le", "logical_and", "logical_or", "logical_not"
      ]
    },
    "medium_priority": {
      "description": "Advanced math, specialized functions, and inplace operations",
      "count": 186
    },
    "low_priority": {
      "description": "Backward operations and utilities", 
      "count": 80
    }
  },
  "categories": {
    "unary": {
      "description": "Single input tensor operations",
      "subcategories": {
        "basic": {
          "description": "Basic mathematical functions",
          "operations": [
            "abs", "acos", "asin", "asinh", "atan", "atanh", "cos", "acosh", 
            "erfinv", "exp2", "expm1", "gez", "gtz", "i0", "i1", "isfinite", 
            "isinf", "isnan", "isneginf", "isposinf", "lez", "log", "log10", 
            "log2", "log1p", "logical_not", "ltz", "neg", "nez", "reciprocal", 
            "relu", "relu6", "sign", "signbit", "silu", "sin", "sqrt", "square", 
            "tan", "bitwise_not", "floor", "ceil", "trunc", "eqz", "mish", 
            "tanhshrink", "deg2rad", "rad2deg", "identity"
          ],
          "count": 47
        },
        "fast_approximate": {
          "description": "Fast/approximate implementations",
          "operations": ["exp", "erf", "erfc", "gelu", "rsqrt", "sigmoid", "sigmoid_accurate"],
          "count": 7
        },
        "with_params": {
          "description": "Operations with parameters",
          "operations": [
            "elu", "heaviside", "leaky_relu", "relu_max", "relu_min", 
            "fill", "glu", "reglu", "geglu", "swiglu", "clip", "clamp", "threshold"
          ],
          "count": 13
        },
        "composite_special": {
          "description": "Composite and special functions",
          "operations": [
            "softplus", "tanh", "log_sigmoid", "unary_chain", "cbrt", "cosh", 
            "digamma", "lgamma", "multigammaln", "polygamma", "sinh", "softsign", "swish", 
            "frac", "hardswish", "hardsigmoid", "hardtanh", "selu", "tril", "triu",
            "round", "logit", "prelu", "softshrink", "hardshrink"
          ],
          "count": 25
        },
        "hardware_specific": {
          "description": "Hardware-optimized operations",
          "operations": ["var_hw", "std_hw"],
          "count": 2
        },
        "unary_inplace": {
          "description": "Unary inplace operations",
          "operations": ["logical_not_"],
          "count": 1
        }
      },
      "total_count": 98
    },
    "binary": {
      "description": "Two input tensor operations",
      "subcategories": {
        "arithmetic": {
          "description": "Basic arithmetic operations",
          "operations": ["add", "subtract", "multiply", "divide", "mul", "sub", "rpow", "rdiv", "assign"],
          "count": 9
        },
        "arithmetic_inplace": {
          "description": "Arithmetic inplace operations",
          "operations": ["add_", "subtract_", "multiply_", "divide_", "mul_", "sub_", "div_", "rsub_"],
          "count": 8
        },
        "comparison": {
          "description": "Comparison operations",
          "operations": ["gt", "lt", "eq", "ne", "ge", "le"],
          "count": 6
        },
        "comparison_inplace": {
          "description": "Comparison inplace operations",
          "operations": ["gt_", "lt_", "eq_", "ne_", "ge_", "le_"],
          "count": 6
        },
        "logical": {
          "description": "Logical operations",
          "operations": ["logical_and", "logical_or", "logical_xor", "ldexp", "xlogy"],
          "count": 5
        },
        "logical_inplace": {
          "description": "Logical inplace operations",
          "operations": ["logical_and_", "logical_or_", "logical_xor_", "ldexp_", "logaddexp_"],
          "count": 5
        },
        "bitwise": {
          "description": "Bitwise operations",
          "operations": ["bitwise_and", "bitwise_or", "bitwise_xor"],
          "count": 3
        },
        "mathematical": {
          "description": "Advanced mathematical operations",
          "operations": [
            "atan2", "hypot", "logaddexp", "logaddexp2", "maximum", "minimum", 
            "pow", "fmod", "remainder", "nextafter", "bias_gelu", "polyval"
          ],
          "count": 12
        },
        "mathematical_inplace": {
          "description": "Mathematical inplace operations",
          "operations": ["bias_gelu_", "logaddexp2_", "squared_difference_"],
          "count": 3
        },
        "advanced": {
          "description": "Advanced mathematical operations",
          "operations": [
            "addalpha", "subalpha", "squared_difference", 
            "absolute_difference", "isclose", "round_binary", "clip_binary"
          ],
          "count": 7
        }
      },
      "total_count": 64
    },
    "ternary": {
      "description": "Three input tensor operations",
      "operations": ["addcdiv", "addcmul", "where", "mac", "lerp"],
      "total_count": 5
    },
    "reduction": {
      "description": "Reduction operations",
      "operations": ["max", "min", "mean", "sum", "prod", "var", "std", "cumsum", "cumprod"],
      "total_count": 9
    },
    "backward": {
      "description": "Backward pass operations for training",
      "subcategories": {
        "unary_backward": {
          "description": "Backward operations for unary functions",
          "operations": [
            "abs_bw", "acos_bw", "acosh_bw", "asin_bw", "asinh_bw", "atan_bw", 
            "atanh_bw", "ceil_bw", "cos_bw", "cosh_bw", "deg2rad_bw", "digamma_bw", 
            "erf_bw", "erfc_bw", "erfinv_bw", "exp_bw", "exp2_bw", "expm1_bw", 
            "floor_bw", "frac_bw", "gelu_bw", "hardsigmoid_bw", "hardswish_bw", 
            "i0_bw", "lgamma_bw", "log_bw", "log_sigmoid_bw", "log1p_bw", "log10_bw", 
            "log2_bw", "logit_bw", "multigammaln_bw", "neg_bw", "rad2deg_bw", 
            "reciprocal_bw", "relu_bw", "relu6_bw", "round_bw", "rsqrt_bw", 
            "selu_bw", "sigmoid_bw", "sign_bw", "silu_bw", "sin_bw", "sinh_bw", 
            "softsign_bw", "sqrt_bw", "square_bw", "tan_bw", "tanh_bw", 
            "tanhshrink_bw", "trunc_bw", "fill_bw", "fill_zero_bw", "hardshrink_bw", "softshrink_bw"
          ],
          "count": 51
        },
        "binary_backward": {
          "description": "Backward operations for binary functions",
          "operations": [
            "add_bw", "atan2_bw", "bias_gelu_bw", "div_bw", "fmod_bw", "hypot_bw", 
            "ldexp_bw", "logaddexp_bw", "logaddexp2_bw", "max_bw", "min_bw", "mul_bw", 
            "remainder_bw", "rsub_bw", "squared_difference_bw", "sub_bw", "xlogy_bw",
            "pow_bw", "addalpha_bw", "subalpha_bw"
          ],
          "count": 20
        },
        "ternary_backward": {
          "description": "Backward operations for ternary functions",
          "operations": ["addcdiv_bw", "addcmul_bw", "lerp_bw", "where_bw"],
          "count": 4
        },
        "reduction_backward": {
          "description": "Backward operations for reduction functions",
          "operations": ["sum_bw", "mean_bw", "var_bw", "std_bw", "prod_bw"],
          "count": 5
        }
      },
      "total_count": 80
    },
    "complex": {
      "description": "Complex number operations",
      "subcategories": {
        "complex_unary": {
          "description": "Complex unary operations",
          "operations": ["complex_abs", "complex_recip"],
          "count": 2
        },
        "complex_tensor_creation": {
          "description": "Complex tensor creation operations",
          "operations": ["complex_tensor", "real", "imag", "angle", "conj", "polar"],
          "count": 6
        }
      },
      "total_count": 8
    }
  },
  "inplace_operations": {
    "description": "All inplace operations (ending with underscore)",
    "total_count": 24,
    "operations": [
      "add_", "bias_gelu_", "div_", "divide_", "eq_", "ge_", "gt_", "ldexp_", 
      "le_", "logaddexp2_", "logaddexp_", "logical_and_", "logical_not_", 
      "logical_or_", "logical_xor_", "lt_", "mul_", "multiply_", "ne_", 
      "rsub_", "squared_difference_", "sub_", "subtract_"
    ]
  },
  "performance_tracking": {
    "recommended_metrics": [
      "latency", "throughput", "memory_usage", "hardware_utilization", "power_consumption"
    ],
    "monitoring_schedule": {
      "high_priority": "daily",
      "medium_priority": "weekly", 
      "low_priority": "monthly"
    }
  },
  "validation": {
    "method": "Direct TT-Metal TTNN attribute checking and test validation",
    "environment": "ttcd activated tt-metal environment",
    "test_coverage": "262/288 operations (91.0%)"
  }
}; 