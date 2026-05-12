方程组

$$
\left\{ \begin{array}{l} a _ {1 1} x _ {1} + a _ {1 2} x _ {2} + \dots + a _ {1 n} x _ {n} = b _ {1}, \\ a _ {2 1} x _ {1} + a _ {2 2} x _ {2} + \dots + a _ {2 n} x _ {n} = b _ {2}, \\ \dots \dots \\ a _ {m 1} x _ {1} + a _ {m 2} x _ {2} + \dots + a _ {m n} x _ {n} = b _ {m} \end{array} \right. \tag {12.5}
$$

称为线性方程组.其中 $x_{1},x_{2},\dots ,x_{n}$ 是未知量， $a_{ij}(i = 1,2,\dots ,m,j = 1,2,\dots n)$ 为已知系数， $b_{1},b_{2},\dots ,b_{m}$ 是已知的常数项．若存在 $_n$ 个数 $c_{1},c_{2},\dots ,c_{n}$ ，当以

$$
x _ {1} = c _ {1}, x _ {2} = c _ {2}, \dots , x _ {n} = c _ {n} \tag {12.6}
$$

代入方程（12.5）以后，每个方程都成为恒等式，则称（12.6）为方程组（12.5）的一个解。

采用矩阵和向量的记号，记

$$
\boldsymbol {A} = \left( \begin{array}{c c c c} a _ {1 1} & a _ {1 2} & \dots & a _ {1 n} \\ a _ {2 1} & a _ {2 2} & \dots & a _ {2 n} \\ \vdots & \vdots & & \vdots \\ a _ {m 1} & a _ {m 2} & \dots & a _ {m n} \end{array} \right), \quad \boldsymbol {x} = \left( \begin{array}{c} x _ {1} \\ x _ {2} \\ \vdots \\ x _ {n} \end{array} \right), \quad \boldsymbol {b} = \left( \begin{array}{c} b _ {1} \\ b _ {2} \\ \vdots \\ b _ {m} \end{array} \right),
$$

则（12.5）可以简洁地写成

$$
A \boldsymbol {x} = \boldsymbol {b}, \tag {12.7}
$$

其中 $A$ 称为系数矩阵， $\pmb{x}$ 是未知向量， $\textit{\textbf{b}}$ 是以（12.5）的常数项为分量的列向量，称之为常数列.而解（12.6）也就写成向量的形式：

$$
\boldsymbol {x} = \left( \begin{array}{c} c _ {1} \\ c _ {2} \\ \vdots \\ c _ {n} \end{array} \right) = (c _ {1}, c _ {2}, \dots , c _ {n}) ^ {\mathrm {T}}.
$$

若 $b \neq \theta$ , 称 (12.7)(亦即 (12.5)) 为非齐次线性方程组; 若 $b = \theta$ , 则称之为齐次线性方程组.

方程组 (12.5) 有 $n$ 个未知数, $m$ 个方程. 一般而言, $m > n$ , $m = n$ , $m < n$ 都是可能的. 本节所要解决的问题是: 对于给定的 $\mathbf{A}$ 和 $\mathbf{b}$ , (12.7) 亦即 (12.5) 有没有解? 如果有, 有多少个解? 如何求出这些解. 我们从最简单的情形开始.
